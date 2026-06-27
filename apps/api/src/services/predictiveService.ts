import { prisma } from '../lib/prisma';
import { GoogleGenAI } from '@google/genai';
import { runLSTMInference, LSTMResult } from './lstmService';

export interface PredictiveInsight {
  machineId: number;
  machineCode: string;
  machineName: string;
  hasAnomaly: boolean;
  riskScore: number;
  daysToFailure: number;
  analysis: string;
  recommendedAction: string;
  recommendedMaintenanceDate: string;
  pendingScheduleId?: number | null;
  isSimulated: boolean;
  lstmAnomalyScore: number;
  lstmForecastTemp: number[];
  lstmForecastVib: number[];
}

export async function runPredictiveAnalysis(machineId: number): Promise<PredictiveInsight> {
  const machine = await prisma.machine.findUnique({
    where: { id: BigInt(machineId) },
    include: {
      zone: { include: { factory: true } },
      sensors: {
        include: {
          readings: {
            orderBy: { recordedAt: 'desc' },
            take: 24, // Lấy 24 bản ghi đo đạc gần nhất
          }
        }
      }
    }
  });

  if (!machine) {
    throw new Error('Machine not found');
  }

  // 1. Chạy phân tích mạng nơ-ron LSTM bằng TensorFlow.js cục bộ trước
  const tempSensor = machine.sensors.find(s => s.sensorType === 'TEMPERATURE');
  const vibSensor = machine.sensors.find(s => s.sensorType === 'VIBRATION');

  const tempValues = tempSensor ? tempSensor.readings.map(r => Number(r.value)).reverse() : [];
  const vibValues = vibSensor ? vibSensor.readings.map(r => Number(r.value)).reverse() : [];

  const lstmResult = await runLSTMInference(tempValues, vibValues);

  // Chuẩn bị chuỗi dữ liệu gửi lên Gemini
  const sensorDataSummary = machine.sensors.map(sensor => ({
    type: sensor.sensorType,
    unit: sensor.unit,
    minThreshold: Number(sensor.minThreshold),
    maxThreshold: Number(sensor.maxThreshold),
    readings: sensor.readings.map(r => ({
      value: Number(r.value),
      time: r.recordedAt.toISOString(),
    }))
  }));

  const apiKey = process.env.GEMINI_API_KEY || "AQ.Ab8RN6LEp1JhgB2Y7r4e9oaJSh5J8QujVEqXef8HyHc5SUIRkw";

  if (apiKey) {
    try {
      const prompt = `Bạn là một Kỹ sư độ tin cậy thiết bị AI (AI Reliability Engineer) giám sát nhà máy thông minh.
Hãy phân tích chuỗi số liệu cảm biến trong 24 giờ qua của thiết bị "${machine.name}" (Mã: ${machine.code}) đặt tại "${machine.zone.factory.name} > ${machine.zone.name}":

${JSON.stringify(sensorDataSummary, null, 2)}

[PHÂN TÍCH TỪ MẠNG NƠ-RON LSTM - TENSORFLOW]:
- Điểm bất thường (LSTM Anomaly Score): ${lstmResult.anomalyScore}%
- Dự báo nhiệt độ 5 ngày tới: ${lstmResult.forecast.temperature.join(', ')} °C
- Dự báo độ rung 5 ngày tới: ${lstmResult.forecast.vibration.join(', ')} mm/s

Nhiệm vụ của bạn là:
1. Kết hợp thông tin chẩn đoán từ mô hình LSTM ở trên để đưa ra đánh giá.
2. Phát hiện xem có xu hướng bất thường nhỏ nào tích lũy dần theo thời gian không (ví dụ: nhiệt độ tăng dần đều qua các tiếng, hoặc độ rung tăng nhẹ mà chưa chạm ngưỡng tĩnh cảnh báo).
3. Tính toán độ rủi ro hư hỏng (riskScore) từ 0 đến 100% (cần tham khảo sát sao từ LSTM Anomaly Score).
4. Dự đoán số ngày còn lại trước khi máy hỏng thực tế (daysToFailure), thông thường từ 3 đến 5 ngày nếu có xu hướng xấu.
5. Trả về hướng dẫn đề xuất bảo trì (analysis & recommendedAction).
6. Đề xuất ngày bảo trì tối ưu (recommendedMaintenanceDate) định dạng YYYY-MM-DD (dựa trên ngày hiện tại là ${new Date().toISOString().split('T')[0]}).

Bạn phải trả về phản hồi dưới dạng JSON hợp lệ duy nhất có cấu trúc sau, không kèm bất kỳ ký tự Markdown hay giải thích nào khác ngoài JSON:
{
  "hasAnomaly": boolean,
  "riskScore": number (từ 0 đến 100),
  "daysToFailure": number (từ 0 đến 30, nếu hasAnomaly = false thì trả về 0),
  "analysis": "Phân tích xu hướng thông số cảm biến bằng tiếng Việt",
  "recommendedAction": "Đề xuất chi tiết hành động bảo dưỡng bằng tiếng Việt",
  "recommendedMaintenanceDate": "YYYY-MM-DD"
}`;

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      const jsonText = response.text;
      if (jsonText) {
        const parsed = JSON.parse(jsonText.trim());
          
          // Lưu kết quả cảnh báo dự báo vào DB nếu phát hiện bất thường
          let pendingScheduleId: number | null = null;
          if (parsed.hasAnomaly) {
            const schedule = await handlePredictiveAnomaly(machine, parsed);
            if (schedule) {
              pendingScheduleId = Number(schedule.id);
            }
          }

          return {
            machineId,
            machineCode: machine.code,
            machineName: machine.name,
            pendingScheduleId,
            isSimulated: false,
            lstmAnomalyScore: lstmResult.anomalyScore,
            lstmForecastTemp: lstmResult.forecast.temperature,
            lstmForecastVib: lstmResult.forecast.vibration,
            ...parsed
          };
        }
      } catch (err) {
        console.error('[PredictiveService] Failed to analyze via Gemini, falling back to simulation:', err);
      }
    }

  // Fallback Simulator nếu không có API key hoặc gọi API bị lỗi
  return runSimulationAnalysis(machine, lstmResult);
}

async function handlePredictiveAnomaly(machine: any, parsed: any) {
  // 1. Tạo Cảnh Báo Dự Báo (Predictive Alert) nếu chưa tồn tại cảnh báo tương tự đang mở
  const existingAlert = await prisma.alert.findFirst({
    where: {
      machineId: machine.id,
      alertType: 'PREDICTIVE_ANOMALY',
      status: 'OPEN'
    }
  });

  if (!existingAlert) {
    const rawMessage = `[AI Gemini] Dự báo sự cố: ${parsed.analysis}. Đề xuất: ${parsed.recommendedAction}`;
    await prisma.alert.create({
      data: {
        machineId: machine.id,
        alertType: 'PREDICTIVE_ANOMALY',
        severity: parsed.riskScore > 80 ? 'CRITICAL' : 'WARNING',
        message: rawMessage.substring(0, 2995),
        thresholdValue: 0,
        actualValue: parsed.riskScore,
        status: 'OPEN'
      }
    });
  }

  // Tìm xem đã có lịch trình PENDING nào cho máy này chưa
  let pendingSchedule = await prisma.maintenanceSchedule.findFirst({
    where: {
      machineId: machine.id,
      status: 'PENDING'
    }
  });

  if (!pendingSchedule) {
    // 2. Tìm kỹ thuật viên đầu tiên trong database để gán lịch
    const tech = await prisma.user.findFirst({ where: { role: 'TECHNICIAN' } });
    if (tech) {
      // 3. Tạo lịch bảo trì dự phòng ở trạng thái PENDING
      pendingSchedule = await prisma.maintenanceSchedule.create({
        data: {
          machineId: machine.id,
          maintenanceType: 'PREVENTIVE',
          frequencyDays: 30,
          nextDueDate: new Date(parsed.recommendedMaintenanceDate),
          assignedTechnicianId: tech.id,
          status: 'PENDING', // Kỹ sư cần nhấn duyệt để chuyển thành SCHEDULED
          description: `[Đề xuất bởi Gemini AI] ${parsed.recommendedAction}`
        }
      });
    }
  }

  return pendingSchedule;
}

async function runSimulationAnalysis(machine: any, lstmResult: LSTMResult): Promise<PredictiveInsight> {
  // Phân tích thống kê cơ bản để giả lập kết hợp dữ liệu LSTM
  const hasAnomaly = lstmResult.anomalyScore > 40;
  const riskScore = lstmResult.anomalyScore;
  const daysToFailure = hasAnomaly ? 4 : 0;
  
  let analysis = 'Các chỉ số cảm biến đang nằm trong giới hạn cho phép theo phân tích của mô hình LSTM. Không phát hiện xu hướng bất thường nào.';
  let recommendedAction = 'Tiếp tục vận hành bình thường và duy trì lịch bảo dưỡng định kỳ.';

  if (hasAnomaly) {
    analysis = `Mô hình LSTM phát hiện xu hướng bất thường tích lũy (LSTM Anomaly Score: ${riskScore}%). Xu hướng nhiệt độ/độ rung cảnh báo khả năng mòn ổ đỡ hoặc thiếu dầu bôi trơn trục.`;
    recommendedAction = 'Yêu cầu kiểm tra căn chỉnh đồng trục và bổ sung mỡ bôi trơn cho vòng bi ổ đỡ chính.';
  }

  const recommendedDate = new Date();
  recommendedDate.setDate(recommendedDate.getDate() + (daysToFailure || 5));
  const recommendedMaintenanceDate = recommendedDate.toISOString().split('T')[0];

  const parsed = {
    hasAnomaly,
    riskScore,
    daysToFailure,
    analysis,
    recommendedAction,
    recommendedMaintenanceDate
  };

  let pendingScheduleId: number | null = null;
  if (hasAnomaly) {
    const schedule = await handlePredictiveAnomaly(machine, parsed);
    if (schedule) {
      pendingScheduleId = Number(schedule.id);
    }
  }

  return {
    machineId: Number(machine.id),
    machineCode: machine.code,
    machineName: machine.name,
    pendingScheduleId,
    isSimulated: true,
    lstmAnomalyScore: lstmResult.anomalyScore,
    lstmForecastTemp: lstmResult.forecast.temperature,
    lstmForecastVib: lstmResult.forecast.vibration,
    ...parsed
  };
}
