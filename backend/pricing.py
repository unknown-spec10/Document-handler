import os
import json
import calendar
from datetime import datetime, date, timedelta
from typing import Dict, Any

from backend.config import AWS_REGION

CACHE_FILE = os.path.join(os.path.dirname(__file__), "pricing_cache.json")

# Sensible default rates for local/dev fallback
DEFAULT_RATES = {
    "s3_storage_per_gb": 0.023,
    "rds_storage_per_gb": 0.115,
    "rds_instance_rates": {
        "db.t3.micro": 0.016986,
        "db.t3.small": 0.033972,
        "db.t3.medium": 0.067945
    },
    "ec2_instance_rates": {
        "t3.micro": 0.0104,
        "t3.small": 0.023014,
        "t3.medium": 0.046028
    }
}

REGION_TO_LOCATION = {
    "us-east-1": "US East (N. Virginia)",
    "us-east-2": "US East (Ohio)",
    "us-west-1": "US West (N. California)",
    "us-west-2": "US West (Oregon)",
    "ap-east-1": "Asia Pacific (Hong Kong)",
    "ap-south-1": "Asia Pacific (Mumbai)",
    "ap-northeast-1": "Asia Pacific (Tokyo)",
    "ap-northeast-2": "Asia Pacific (Seoul)",
    "ap-northeast-3": "Asia Pacific (Osaka)",
    "ap-southeast-1": "Asia Pacific (Singapore)",
    "ap-southeast-2": "Asia Pacific (Sydney)",
    "ca-central-1": "Canada (Central)",
    "eu-central-1": "Europe (Frankfurt)",
    "eu-west-1": "Europe (Ireland)",
    "eu-west-2": "Europe (London)",
    "eu-west-3": "Europe (Paris)",
    "eu-north-1": "Europe (Stockholm)",
    "me-south-1": "Middle East (Bahrain)",
    "sa-east-1": "South America (Sao Paulo)"
}

def load_pricing_cache() -> Dict[str, Any]:
    """Loads the pricing rates from pricing_cache.json or returns default values."""
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r") as f:
                data = json.load(f)
                if "timestamp" in data and "rates" in data:
                    return data
        except Exception as e:
            print(f"Failed to read pricing cache file: {e}")
    
    # Return default cache if file is missing or invalid
    return {
        "timestamp": (datetime.utcnow() - timedelta(days=10)).isoformat(),
        "rates": DEFAULT_RATES
    }

def save_pricing_cache(rates: dict):
    """Saves the pricing rates to pricing_cache.json with a timestamp."""
    data = {
        "timestamp": datetime.utcnow().isoformat(),
        "rates": rates
    }
    try:
        os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
        with open(CACHE_FILE, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"Failed to save pricing cache file: {e}")

def extract_price_from_product_json(data: dict) -> float:
    """Helper to parse deep nested price list json representation."""
    terms = data.get('terms', {})
    on_demand = terms.get('OnDemand', {})
    for offer in on_demand.values():
        price_dimensions = offer.get('priceDimensions', {})
        for price_dim in price_dimensions.values():
            price_per_unit = price_dim.get('pricePerUnit', {})
            if 'USD' in price_per_unit:
                return float(price_per_unit['USD'])
    return 0.0

def fetch_pricing_rates_from_aws() -> dict:
    """Calls the Price List API directly to fetch fresh pricing rates."""
    import boto3
    from backend.config import AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
    
    if not AWS_ACCESS_KEY_ID or not AWS_SECRET_ACCESS_KEY:
        raise ValueError("AWS credentials are not set")
        
    client = boto3.client(
        'pricing',
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name='us-east-1'  # Price List endpoint is us-east-1
    )
    
    location_name = REGION_TO_LOCATION.get(AWS_REGION, "Asia Pacific (Mumbai)")
    rates = {
        "s3_storage_per_gb": DEFAULT_RATES["s3_storage_per_gb"],
        "rds_storage_per_gb": DEFAULT_RATES["rds_storage_per_gb"],
        "rds_instance_rates": DEFAULT_RATES["rds_instance_rates"].copy(),
        "ec2_instance_rates": DEFAULT_RATES["ec2_instance_rates"].copy()
    }
    
    # 1. Fetch S3 standard storage rate
    try:
        response = client.get_products(
            ServiceCode='AmazonS3',
            Filters=[
                {'Type': 'TERM_MATCH', 'Field': 'location', 'Value': location_name},
                {'Type': 'TERM_MATCH', 'Field': 'volumeType', 'Value': 'Standard'},
                {'Type': 'TERM_MATCH', 'Field': 'productFamily', 'Value': 'Storage'}
            ]
        )
        for item in response.get('PriceList', []):
            product_data = json.loads(item)
            price = extract_price_from_product_json(product_data)
            if price > 0:
                rates["s3_storage_per_gb"] = price
                break
    except Exception as e:
        print(f"Failed to fetch S3 pricing: {e}")
        
    # 2. Fetch RDS storage rate
    try:
        response = client.get_products(
            ServiceCode='AmazonRDS',
            Filters=[
                {'Type': 'TERM_MATCH', 'Field': 'location', 'Value': location_name},
                {'Type': 'TERM_MATCH', 'Field': 'volumeType', 'Value': 'General Purpose'},
                {'Type': 'TERM_MATCH', 'Field': 'productFamily', 'Value': 'Database Storage'}
            ]
        )
        for item in response.get('PriceList', []):
            product_data = json.loads(item)
            price = extract_price_from_product_json(product_data)
            if price > 0:
                rates["rds_storage_per_gb"] = price
                break
    except Exception as e:
        print(f"Failed to fetch RDS storage pricing: {e}")

    # 3. Fetch RDS instance rates
    for instance in rates["rds_instance_rates"]:
        try:
            response = client.get_products(
                ServiceCode='AmazonRDS',
                Filters=[
                    {'Type': 'TERM_MATCH', 'Field': 'location', 'Value': location_name},
                    {'Type': 'TERM_MATCH', 'Field': 'instanceType', 'Value': instance},
                    {'Type': 'TERM_MATCH', 'Field': 'databaseEngine', 'Value': 'PostgreSQL'},
                    {'Type': 'TERM_MATCH', 'Field': 'deploymentOption', 'Value': 'Single-AZ'},
                    {'Type': 'TERM_MATCH', 'Field': 'productFamily', 'Value': 'Database Instance'}
                ]
            )
            for item in response.get('PriceList', []):
                product_data = json.loads(item)
                price = extract_price_from_product_json(product_data)
                if price > 0:
                    rates["rds_instance_rates"][instance] = price
                    break
        except Exception as e:
            print(f"Failed to fetch RDS instance pricing for {instance}: {e}")

    # 4. Fetch EC2 instance rates
    for instance in rates["ec2_instance_rates"]:
        try:
            response = client.get_products(
                ServiceCode='AmazonEC2',
                Filters=[
                    {'Type': 'TERM_MATCH', 'Field': 'location', 'Value': location_name},
                    {'Type': 'TERM_MATCH', 'Field': 'instanceType', 'Value': instance},
                    {'Type': 'TERM_MATCH', 'Field': 'operatingSystem', 'Value': 'Linux'},
                    {'Type': 'TERM_MATCH', 'Field': 'tenancy', 'Value': 'Shared'},
                    {'Type': 'TERM_MATCH', 'Field': 'preInstalledSw', 'Value': 'NA'},
                    {'Type': 'TERM_MATCH', 'Field': 'capacityStatus', 'Value': 'Used'},
                    {'Type': 'TERM_MATCH', 'Field': 'productFamily', 'Value': 'Compute Instance'}
                ]
            )
            for item in response.get('PriceList', []):
                product_data = json.loads(item)
                price = extract_price_from_product_json(product_data)
                if price > 0:
                    rates["ec2_instance_rates"][instance] = price
                    break
        except Exception as e:
            print(f"Failed to fetch EC2 instance pricing for {instance}: {e}")

    return rates

def update_pricing_cache_task():
    """Background task to fetch rates and update cache file."""
    try:
        fresh_rates = fetch_pricing_rates_from_aws()
        save_pricing_cache(fresh_rates)
        print("Pricing cache updated successfully from AWS Price List API.")
    except Exception as e:
        print(f"Failed to update pricing cache in background: {e}")

def get_rates(background_tasks) -> dict:
    """Gets the cached rates. Triggers a background refresh if cache is >7 days old."""
    cache = load_pricing_cache()
    try:
        timestamp = datetime.fromisoformat(cache["timestamp"])
        if datetime.utcnow() - timestamp > timedelta(days=7):
            background_tasks.add_task(update_pricing_cache_task)
    except Exception as e:
        print(f"Error checking cache age: {e}")
        background_tasks.add_task(update_pricing_cache_task)
        
    return cache["rates"]

def fetch_actual_costs_from_aws() -> dict:
    """Queries Cost Explorer for unblended spend grouped by service for the current month."""
    import boto3
    from backend.config import AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
    
    if not AWS_ACCESS_KEY_ID or not AWS_SECRET_ACCESS_KEY:
        raise ValueError("AWS credentials are not configured")
        
    client = boto3.client(
        'ce',
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name='us-east-1'
    )
    
    today = date.today()
    start_date = date(today.year, today.month, 1)
    end_date = today + timedelta(days=1)  # exclusive boundary
    
    response = client.get_cost_and_usage(
        TimePeriod={
            'Start': start_date.strftime('%Y-%m-%d'),
            'End': end_date.strftime('%Y-%m-%d')
        },
        Granularity='MONTHLY',
        Metrics=['UnblendedCost'],
        GroupBy=[
            {
                'Type': 'DIMENSION',
                'Key': 'SERVICE'
            }
        ]
    )
    
    costs = {"s3": 0.0, "rds": 0.0}
    results = response.get("ResultsByTime", [])
    for result in results:
        groups = result.get("Groups", [])
        for group in groups:
            keys = group.get("Keys", [])
            metrics = group.get("Metrics", {})
            unblended_cost = metrics.get("UnblendedCost", {})
            amount = float(unblended_cost.get("Amount", 0.0))
            
            for key in keys:
                if "Simple Storage" in key or "S3" in key:
                    costs["s3"] += amount
                elif "Relational Database" in key or "RDS" in key:
                    costs["rds"] += amount
                    
    return costs

async def get_s3_usage_gb() -> float:
    """Calculates active S3 storage size in GB."""
    try:
        from backend.s3 import get_s3_session
        from backend.config import S3_BUCKET_NAME
        from botocore.config import Config
        
        session = get_s3_session()
        endpoint_url = f"https://s3.{AWS_REGION}.amazonaws.com" if AWS_REGION else None
        config = Config(signature_version='s3v4')
        total_bytes = 0
        async with session.client("s3", endpoint_url=endpoint_url, config=config) as s3_client:
            paginator = s3_client.get_paginator("list_objects_v2")
            async for page in paginator.paginate(Bucket=S3_BUCKET_NAME):
                if "Contents" in page:
                    for obj in page["Contents"]:
                        total_bytes += obj.get("Size", 0)
        
        gb = total_bytes / (1024 ** 3)
        return round(gb, 4)
    except Exception as e:
        print(f"Failed to calculate actual S3 usage size dynamically: {e}")
        return 0.5  # fallback default 500MB
