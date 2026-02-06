"""S3 image storage for card creation pipelines.

Handles uploading images to S3 with content-based deduplication
and obfuscated filenames.
"""

import hashlib
import os
import secrets
from pathlib import Path
from typing import Optional, Union

import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv

load_dotenv()


class S3ImageStorage:
    """Image storage using AWS S3."""

    def __init__(
        self,
        bucket_name: Optional[str] = None,
        region: Optional[str] = None,
        public_url: Optional[str] = None,
        access_key_id: Optional[str] = None,
        secret_access_key: Optional[str] = None,
    ):
        self.bucket_name = bucket_name or os.getenv("S3_BUCKET_NAME")
        self.region = region or os.getenv("S3_REGION", "us-east-1")
        self.public_url = (public_url or os.getenv("S3_PUBLIC_URL", "")).rstrip("/")

        if not self.bucket_name:
            raise ValueError("S3_BUCKET_NAME not set")

        self.s3 = boto3.client(
            "s3",
            region_name=self.region,
            aws_access_key_id=access_key_id or os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=secret_access_key or os.getenv("AWS_SECRET_ACCESS_KEY"),
        )

        self._uploaded_hashes: dict[str, str] = {}

    def _compute_hash(self, file_path: Path) -> str:
        hasher = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                hasher.update(chunk)
        return hasher.hexdigest()

    def _generate_key(self, subfolder: str, suffix: str) -> str:
        random_token = secrets.token_hex(16)
        if subfolder:
            return f"srs/{subfolder}/{random_token}{suffix}"
        return f"srs/{random_token}{suffix}"

    def store_image(
        self,
        source_path: Union[str, Path],
        subfolder: str = "",
        filename_prefix: str = "",
    ) -> str:
        """Store an image in S3 and return its public URL."""
        source_path = Path(source_path)
        if not source_path.exists():
            raise FileNotFoundError(f"Image not found: {source_path}")

        content_hash = self._compute_hash(source_path)
        if content_hash in self._uploaded_hashes:
            return self._uploaded_hashes[content_hash]

        suffix = source_path.suffix.lower()
        s3_key = self._generate_key(subfolder, suffix)

        content_types = {
            ".png": "image/png",
            ".gif": "image/gif",
            ".webp": "image/webp",
        }
        content_type = content_types.get(suffix, "image/jpeg")

        self.s3.upload_file(
            str(source_path),
            self.bucket_name,
            s3_key,
            ExtraArgs={"ContentType": content_type},
        )

        if self.public_url:
            url = f"{self.public_url}/{s3_key}"
        else:
            url = f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{s3_key}"

        self._uploaded_hashes[content_hash] = url
        return url

    def delete_image(self, url: str) -> bool:
        """Delete an image from S3 by its URL."""
        if self.public_url and url.startswith(self.public_url):
            key = url[len(self.public_url) + 1 :]
        else:
            prefix = f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/"
            if url.startswith(prefix):
                key = url[len(prefix) :]
            else:
                return False

        try:
            self.s3.delete_object(Bucket=self.bucket_name, Key=key)
            return True
        except ClientError:
            return False
