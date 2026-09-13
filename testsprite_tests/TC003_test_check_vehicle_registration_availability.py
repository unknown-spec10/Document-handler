import requests

BASE_URL = "http://localhost:8000"

def test_check_vehicle_registration_availability():
    timeout = 30
    # Known registered vehicle_reg_no (assumed known for test)
    registered_vehicle_reg_no = "ABC1234"
    # Generate a presumably available vehicle_reg_no for test by adding something unlikely registered
    import random, string
    available_vehicle_reg_no = "ZZZ" + ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

    # Test with available vehicle registration number
    params_available = {"vehicle_reg_no": available_vehicle_reg_no}
    try:
        response_available = requests.get(
            f"{BASE_URL}/users/check-vehicle",
            params=params_available,
            timeout=timeout
        )
        assert response_available.status_code == 200, f"Expected 200 OK for available vehicle, got {response_available.status_code}"
        json_avail = response_available.json()
        assert "status" in json_avail or "message" in json_avail, "Response JSON missing 'status' or 'message' key for available vehicle"
        status_val = json_avail.get('status', json_avail.get('message'))
        assert isinstance(status_val, str), "'status' or 'message' key should be a string"
    except requests.RequestException as e:
        assert False, f"Request failed for available vehicle check: {e}"

    # Test with already registered vehicle registration number
    params_registered = {"vehicle_reg_no": registered_vehicle_reg_no}
    try:
        response_registered = requests.get(
            f"{BASE_URL}/users/check-vehicle",
            params=params_registered,
            timeout=timeout
        )
        assert response_registered.status_code == 200, f"Expected 200 OK for registered vehicle, got {response_registered.status_code}"
        json_reg = response_registered.json()
        assert "status" in json_reg or "message" in json_reg, "Response JSON missing 'status' or 'message' key for registered vehicle"
        status_val = json_reg.get('status', json_reg.get('message'))
        assert isinstance(status_val, str), "'status' or 'message' key should be a string"
    except requests.RequestException as e:
        assert False, f"Request failed for registered vehicle check: {e}"

test_check_vehicle_registration_availability()