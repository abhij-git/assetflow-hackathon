from minio import Minio
from app.core.config import settings
import io

class S3Service:
    def __init__(self):
        # Initialize Minio client
        self.client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE
        )
        self.bucket = settings.MINIO_BUCKET_NAME

    def upload_file(self, file_content: bytes, file_name: str, content_type: str) -> str:
        try:
            # Check if bucket exists, if not create it
            if not self.client.bucket_exists(self.bucket):
                self.client.make_bucket(self.bucket)

            # Upload
            data = io.BytesIO(file_content)
            self.client.put_object(
                bucket_name=self.bucket,
                object_name=file_name,
                data=data,
                length=len(file_content),
                content_type=content_type
            )
            
            # Since bucket has public policy, return localhost accessible URL
            # inside docker minio is "minio:9000" but from host it is "localhost:9000"
            return f"http://localhost:9000/{self.bucket}/{file_name}"
        except Exception as e:
            # Fallback or raise
            raise RuntimeError(f"Failed to upload to MinIO: {str(e)}")

s3_service = S3Service()
