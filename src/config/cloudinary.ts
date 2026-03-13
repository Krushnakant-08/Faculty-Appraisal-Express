import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
});

export const getSignedAppraisalPdfUrl = (userId: string, appraisalYear: number): string => {
  const publicId = `Home/Faculty_Appraisal/${appraisalYear}/pdfs/${userId}`;

  return cloudinary.utils.private_download_url(publicId, 'pdf', {
    resource_type: 'image',
    type: 'upload',
    attachment: false,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
  });
};

export default cloudinary;
