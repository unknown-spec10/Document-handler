import aioboto3
from botocore.exceptions import ClientError
from botocore.config import Config
from backend.config import (
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    AWS_REGION,
    S3_BUCKET_NAME,
    PRESIGNED_URL_EXPIRY_SECONDS
)

def get_s3_session():
    """Returns an initialized aioboto3 Session."""
    if not AWS_ACCESS_KEY_ID or not AWS_SECRET_ACCESS_KEY:
        raise ValueError("AWS credentials are not set in config or environment")
    
    return aioboto3.Session(
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name=AWS_REGION
    )

# Module-level client singleton context
_s3_client = None

async def get_s3_client():
    """Return the global async S3 client singleton context."""
    global _s3_client
    if _s3_client is None:
        session = get_s3_session()
        endpoint_url = f"https://s3.{AWS_REGION}.amazonaws.com" if AWS_REGION else None
        config = Config(signature_version='s3v4', max_pool_connections=50)
        _s3_client = await session.client("s3", endpoint_url=endpoint_url, config=config).__aenter__()
    return _s3_client

async def upload_file_to_s3(file_content: bytes, object_key: str, content_type: str, tags: dict = None) -> str:
    """
    Uploads a file to S3 with SSE-S3 (AES256) encryption asynchronously.
    Optionally tags the object for recovery and compliance.
    Returns the object key.
    """
    s3_client = await get_s3_client()
    try:
        put_args = {
            "Bucket": S3_BUCKET_NAME,
            "Key": object_key,
            "Body": file_content,
            "ContentType": content_type,
            "ServerSideEncryption": "AES256"
        }
        if tags:
            import urllib.parse
            put_args["Tagging"] = urllib.parse.urlencode(tags)

        await s3_client.put_object(**put_args)
        return object_key
    except ClientError as e:
        raise RuntimeError(f"Failed to upload to S3: {e}")

async def generate_presigned_url(object_key: str, expires_in: int = PRESIGNED_URL_EXPIRY_SECONDS) -> str:
    """Generates a presigned URL asynchronously to view/download a private S3 object."""
    s3_client = await get_s3_client()
    try:
        url = await s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": S3_BUCKET_NAME, "Key": object_key},
            ExpiresIn=expires_in
        )
        return url
    except ClientError as e:
        raise RuntimeError(f"Failed to generate presigned S3 URL: {e}")

async def delete_user_directory_from_s3(vehicle_reg_no: str) -> None:
    """Deletes all S3 objects under uploads/{vehicle_reg_no}/ directory asynchronously."""
    s3_client = await get_s3_client()
    prefix = f"uploads/{vehicle_reg_no}/"
    try:
        paginator = s3_client.get_paginator("list_objects_v2")
        objects_to_delete = []
        async for page in paginator.paginate(Bucket=S3_BUCKET_NAME, Prefix=prefix):
            if "Contents" in page:
                for obj in page["Contents"]:
                    objects_to_delete.append({"Key": obj["Key"]})
        
        if objects_to_delete:
            await s3_client.delete_objects(
                Bucket=S3_BUCKET_NAME,
                Delete={"Objects": objects_to_delete}
            )
    except ClientError as e:
        raise RuntimeError(f"Failed to delete S3 objects: {e}")

async def verify_s3_bucket_access() -> bool:
    """Verifies that the S3 client can connect and bucket exists asynchronously."""
    s3_client = await get_s3_client()
    try:
        await s3_client.head_bucket(Bucket=S3_BUCKET_NAME)
        return True
    except ClientError as e:
        raise ValueError(f"S3 Bucket verification failed for bucket '{S3_BUCKET_NAME}': {e}")

async def delete_s3_object(object_key: str) -> None:
    """Deletes a single S3 object from the bucket by key asynchronously."""
    s3_client = await get_s3_client()
    try:
        await s3_client.delete_object(Bucket=S3_BUCKET_NAME, Key=object_key)
    except ClientError as e:
        print(f"Failed to delete S3 object '{object_key}': {e}")
