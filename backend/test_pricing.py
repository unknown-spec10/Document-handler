import asyncio
from backend import pricing

def test_fallback_rates():
    # Load pricing cache
    cache = pricing.load_pricing_cache()
    assert "rates" in cache
    assert "s3_storage_per_gb" in cache["rates"]
    assert "rds_storage_per_gb" in cache["rates"]
    
    print("Fallback Rates Test: PASSED")

def test_estimator_math():
    # Calculate costs using the default pricing rates
    rates = pricing.DEFAULT_RATES
    
    # Inputs
    s3_storage_gb = 50.0
    rds_instance_type = "db.t3.micro"
    rds_storage_gb = 20.0
    ec2_instance_type = "t3.small"
    ec2_hours = 730
    
    # S3 Storage Cost
    s3_cost = s3_storage_gb * rates["s3_storage_per_gb"]
    assert abs(s3_cost - 1.15) < 0.01
    
    # RDS Cost
    rds_hourly = rates["rds_instance_rates"][rds_instance_type]
    rds_instance_cost = rds_hourly * 730
    assert abs(rds_instance_cost - 12.40) < 0.05
    
    rds_storage_cost = rds_storage_gb * rates["rds_storage_per_gb"]
    assert abs(rds_storage_cost - 2.30) < 0.01
    
    # EC2 Cost
    ec2_hourly = rates["ec2_instance_rates"][ec2_instance_type]
    ec2_cost = ec2_hourly * ec2_hours
    assert abs(ec2_cost - 16.80) < 0.05
    
    total = s3_cost + rds_instance_cost + rds_storage_cost + ec2_cost
    assert abs(total - 32.65) < 0.1
    
    print("Estimator Math Test: PASSED")

async def test_s3_size_fallback():
    # get_s3_usage_gb should return a float (either actual S3 size or fallback 0.5 GB)
    size = await pricing.get_s3_usage_gb()
    assert isinstance(size, float)
    assert size >= 0
    print(f"S3 size returned: {size} GB")
    print("S3 size fallback Test: PASSED")

def run_tests():
    test_fallback_rates()
    test_estimator_math()
    asyncio.run(test_s3_size_fallback())
    print("\nALL TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    run_tests()
