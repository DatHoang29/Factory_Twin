import { Router, Response } from 'express';
import { AuthRequest, authenticate, authorize } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import path from 'path';
import fs from 'fs';
import multer from 'multer';

export interface UploadRequest extends AuthRequest {
  file?: any;
}

export const uploadRouter = Router();
uploadRouter.use(authenticate);

// Thư mục lưu trữ tệp cục bộ
const uploadDir = path.join(process.cwd(), 'uploads');

// Cấu hình lưu trữ tệp cục bộ sử dụng diskStorage của multer
const storage = multer.diskStorage({
  destination: (req: any, file: any, cb: any) => {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req: any, file: any, cb: any) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // Giới hạn 25MB
});

const allowedExtensions = new Set(['.glb', '.gltf', '.obj', '.fbx', '.jpg', '.jpeg', '.png', '.webp']);

const validateUpload = (file: any, res: Response): boolean => {
  if (!file) {
    res.status(400).json({ error: 'No file uploaded' });
    return false;
  }
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowedExtensions.has(ext)) {
    res.status(400).json({ error: 'File type not supported' });
    return false;
  }
  return true;
};

const getLocalFileUrl = (filename: string) => {
  const port = process.env.API_PORT || 3001;
  return `http://localhost:${port}/uploads/${filename}`;
};

// Upload 3D model cho zone — ADMIN & TECHNICIAN
uploadRouter.post('/3d-model', authorize('ADMIN', 'TECHNICIAN'), upload.single('file'), async (req: UploadRequest, res: Response) => {
  try {
    const { zoneId } = req.body;
    const file = req.file;
    if (!zoneId) return res.status(400).json({ error: 'zoneId is required' });
    if (!validateUpload(file, res)) return;

    const ext = path.extname(file!.originalname).replace('.', '').toUpperCase();
    const format = ext === 'FBX' ? 'FBX' : ext === 'OBJ' ? 'OBJ' : ext;
    const fileUrl = getLocalFileUrl(file!.filename);

    const twinModel = await prisma.twinModel.create({
      data: {
        zoneId: BigInt(zoneId),
        modelType: 'THREE_D_MODEL',
        fileUrl,
        format,
        version: 1,
        uploadedBy: req.user!.id,
      },
    });

    res.status(201).json({ id: twinModel.id.toString(), fileUrl, modelType: '3D_MODEL', format });
  } catch (error) {
    console.error('Upload 3D model error:', error);
    res.status(500).json({ error: 'Failed to upload 3D model' });
  }
});

// Upload ảnh 360° — ADMIN & TECHNICIAN
uploadRouter.post('/360-photo', authorize('ADMIN', 'TECHNICIAN'), upload.single('file'), async (req: UploadRequest, res: Response) => {
  try {
    const { zoneId } = req.body;
    const file = req.file;
    if (!zoneId) return res.status(400).json({ error: 'zoneId is required' });
    if (!validateUpload(file, res)) return;

    const panoramaUrl = getLocalFileUrl(file!.filename);

    const twinModel = await prisma.twinModel.create({
      data: { 
        zoneId: BigInt(zoneId), 
        modelType: 'PHOTO_360', 
        fileUrl: panoramaUrl, 
        format: 'EQUIRECTANGULAR', 
        version: 1, 
        uploadedBy: req.user!.id 
      },
    });

    res.status(201).json({ id: twinModel.id.toString(), panoramaUrl, modelType: 'PHOTO_360' });
  } catch (error) {
    console.error('Upload 360 photo error:', error);
    res.status(500).json({ error: 'Failed to upload 360° photo' });
  }
});

// Upload attachment cho ticket/maintenance — ADMIN, TECHNICIAN, OPERATOR
uploadRouter.post('/attachment', authorize('ADMIN', 'TECHNICIAN', 'OPERATOR'), upload.single('file'), async (req: UploadRequest, res: Response) => {
  try {
    const { relatedType, relatedId } = req.body;
    const file = req.file;
    if (!relatedType || !relatedId) return res.status(400).json({ error: 'relatedType and relatedId are required' });
    if (!validateUpload(file, res)) return;

    const fileUrl = getLocalFileUrl(file!.filename);

    const attachment = await prisma.attachment.create({
      data: { relatedType, relatedId: BigInt(relatedId), fileUrl, fileType: file!.mimetype, uploadedBy: req.user!.id },
    });

    res.status(201).json({ id: attachment.id.toString(), fileUrl, fileType: file!.mimetype });
  } catch (error) {
    console.error('Upload attachment error:', error);
    res.status(500).json({ error: 'Failed to upload attachment' });
  }
});

// Lấy danh sách asset theo zone — tất cả actor có quyền xem
uploadRouter.get('/zone-assets/:zoneId', authorize('ADMIN', 'TECHNICIAN', 'OPERATOR', 'VIEWER'), async (req: AuthRequest, res: Response) => {
  try {
    const { zoneId } = req.params;
    const models = await prisma.twinModel.findMany({
      where: { zoneId: BigInt(zoneId) },
      include: { uploader: { select: { id: true, fullName: true } } },
      orderBy: { uploadedAt: 'desc' },
    });
    res.json({
      models: models.map((m) => ({
        id: m.id.toString(),
        modelType: m.modelType,
        fileUrl: m.fileUrl,
        format: m.format,
        version: m.version,
        uploadedBy: m.uploader.fullName,
        uploadedAt: m.uploadedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Get zone assets error:', error);
    res.status(500).json({ error: 'Failed to fetch zone assets' });
  }
});

// Lấy attachment theo entity — tất cả actor
uploadRouter.get('/attachments/:relatedType/:relatedId', authorize('ADMIN', 'TECHNICIAN', 'OPERATOR', 'VIEWER'), async (req: AuthRequest, res: Response) => {
  try {
    const { relatedType, relatedId } = req.params;
    const attachments = await prisma.attachment.findMany({
      where: { relatedType: relatedType as any, relatedId: BigInt(relatedId) },
      include: { uploader: { select: { id: true, fullName: true } } },
      orderBy: { uploadedAt: 'desc' },
    });
    res.json({
      attachments: attachments.map((a) => ({
        id: a.id.toString(),
        fileUrl: a.fileUrl,
        fileType: a.fileType,
        uploadedBy: a.uploader.fullName,
        uploadedAt: a.uploadedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Get attachments error:', error);
    res.status(500).json({ error: 'Failed to fetch attachments' });
  }
});

// Xóa model — chỉ ADMIN
uploadRouter.delete('/model/:modelId', authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { modelId } = req.params;
    const model = await prisma.twinModel.findUnique({ where: { id: BigInt(modelId) } });
    if (!model) return res.status(404).json({ error: 'Model not found' });
    const filename = path.basename(model.fileUrl);
    const filePath = path.join(uploadDir, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    await prisma.twinModel.delete({ where: { id: BigInt(modelId) } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete model error:', error);
    res.status(500).json({ error: 'Failed to delete model' });
  }
});

export default uploadRouter;