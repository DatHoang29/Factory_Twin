# Factory Digital Twin - Nền tảng Bản sao số Nhà máy thời gian thực

Hệ thống số hóa nhà máy sản xuất dưới dạng mô hình 3D và ảnh toàn cảnh 360° tương tác, kết hợp giám sát telemetry IoT thời gian thực (nhiệt độ, độ rung, sản lượng, năng lượng), quản lý sự cố và báo cáo hiệu suất thiết bị (OEE).

Dự án được xây dựng dưới dạng cấu trúc **Monorepo** sử dụng NPM Workspaces để tối ưu hóa quản lý mã nguồn và chia sẻ tài nguyên.

---

## 🛠️ Stack công nghệ & Cấu trúc thư mục

### 1. Stack công nghệ chính:
* **Cơ sở dữ liệu**: MariaDB / MySQL (ORM: Prisma)
* **Back-end**: Node.js, Express, Socket.IO (WebSockets), Redis (Cache & Pub/Sub), BullMQ (Hàng đợi bất đồng bộ)
* **Front-end**: Next.js (App Router), Tailwind CSS, React Three Fiber / Three.js (WebGL rendering)

### 2. Cấu trúc Monorepo:
* `apps/web`: Ứng dụng Next.js Frontend.
* `apps/api`: RESTful API server kết hợp WebSocket gateway và xử lý tác vụ background (BullMQ Worker).
* `packages/database`: Quản lý Prisma schema, migrations và database seed.
* `packages/shared`: (Tùy chọn) Thư viện chia sẻ TypeScript types và logic dùng chung.

---

## 🚀 Hướng dẫn khởi chạy dự án (Local Setup)

### 1. Yêu cầu hệ thống ban đầu (Prerequisites)
Hãy đảm bảo máy tính của bạn đã cài đặt các dịch vụ sau:
* **Node.js** (Phiên bản khuyến nghị: v18 hoặc v20)
* **MariaDB** hoặc **MySQL Server** đang chạy trên cổng mặc định `3306` (hoặc cổng cấu hình riêng)
* **Redis Server** đang chạy trên cổng mặc định `6379` (để phục vụ Queue và WebSockets Pub/Sub)

### 2. Cấu hình biến môi trường (`.env`)
Tạo tệp `.env` tại **thư mục gốc (root)** của dự án với các thông số kết nối của bạn:

```env
# Database Connection (MariaDB/MySQL)
DATABASE_URL="mysql://root:password@localhost:3306/factory_digital_twin"

# API Port & URL Configuration
PORT=3001
API_PORT=3001
NEXT_PUBLIC_API_URL="http://localhost:3001/api"
JWT_SECRET="dev-secret-change-me-for-starglobal-assessment"

# Redis Configuration
REDIS_HOST="localhost"
REDIS_PORT=6379
```
*(Thay thế `root` và `password` bằng thông tin đăng nhập MariaDB/MySQL thực tế của bạn)*

### 3. Cài đặt các gói phụ thuộc (Dependencies)
Tại thư mục gốc của dự án, chạy lệnh sau để cài đặt tự động toàn bộ dependencies cho tất cả các Workspace:
```bash
npm install
```

### 4. Khởi tạo Cơ sở dữ liệu (Prisma & Seed Data)
Tại thư mục gốc, lần lượt chạy các lệnh sau để đồng bộ schema vào database và khởi tạo dữ liệu mẫu (nhà máy, máy móc, tài khoản demo):

```bash
# Tạo Prisma Client
npm run db:generate

# Chạy Migration để tạo cấu trúc bảng trong MariaDB
npm run db:migrate

# Chèn dữ liệu hạt giống (Seed Data) ban đầu
npm run db:seed
```

### 5. Khởi chạy toàn bộ hệ thống (Development Mode)
Để khởi chạy đồng thời cả **Next.js Web**, **API Server**, **BullMQ Worker** và **Trình giả lập cảm biến IoT (Sensor Generator)** chỉ với 1 lệnh duy nhất tại thư mục gốc:

```bash
npm run dev
```

Hệ thống sẽ hoạt động tại các cổng:
* **Frontend Web**: [http://localhost:3000](http://localhost:3000)
* **Backend API**: [http://localhost:3001](http://localhost:3001)

---

## 🔑 Tài khoản đăng nhập Demo (Đăng nhập thử nghiệm)

Mật khẩu chung cho tất cả các tài khoản demo dưới đây là: **`password123`**

1. **Quản trị viên (Admin)**:
   * Email: `admin@factory.local`
2. **Kỹ thuật viên (Technician)**:
   * Email: `tech@factory.local`
3. **Công nhân vận hành (Operator)**:
   * Email: `operator@factory.local`
4. **Khách tham quan / Đối tác (Viewer)**:
   * Email: `viewer@factory.local`

---

## 📈 Các tính năng nổi bật có trong bản Demo

1. **Giám sát 3D / 360° tương tác**: Chuyển đổi linh hoạt giữa chế độ xem mô hình cấu trúc 3D dạng khối và ảnh Panorama 360° thực tế của phân xưởng.
2. **Cập nhật dữ liệu Real-time**: Trình giả lập cảm biến liên tục đẩy dữ liệu telemetry (Nhiệt độ, rung lắc, năng lượng) trực tiếp qua WebSockets Socket.IO hiển thị lập tức lên frontend.
3. **Cảnh báo bất thường tự động**: Hệ thống phát hiện vượt ngưỡng giá trị an toàn, nhấp nháy đỏ cảnh báo trên giao diện 3D và tự động sinh ticket bảo trì sửa chữa.
4. **Báo cáo OEE & Năng lượng chuyên sâu**: Phân tích biểu đồ sản lượng so với mục tiêu và chi phí tiền điện tiêu thụ trực quan qua các đồ thị SVG tự dựng.
