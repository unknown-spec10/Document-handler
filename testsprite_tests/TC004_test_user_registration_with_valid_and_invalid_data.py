import requests
from requests.auth import HTTPBasicAuth

BASE_URL = "http://localhost:8000"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "adminpass"

def test_user_registration_with_valid_and_invalid_data():
    url = f"{BASE_URL}/users/register"
    timeout = 30

    # Prepare valid payload data
    valid_data = {
        'name': 'John Doe',
        'vehicle_reg_no': 'VALID1234',
        'metadata': '{"test": "valid"}'
    }
    # Prepare multiple valid documents for upload (PDF, JPEG, PNG)
    valid_files = {
        'documents': [
            ('documents', ('doc1.pdf', b'%PDF-1.4 valid pdf content', 'application/pdf')),
            ('documents', ('doc2.jpeg', b'\xff\xd8\xff valid jpeg content', 'image/jpeg')),
            ('documents', ('doc3.png', b'\x89PNG\r\n\x1a\n valid png content', 'image/png'))
        ]
    }
    # requests library expects files as dict, flatten multiple files with same key as list of tuples
    valid_files_flat = [
        ('documents', ('doc1.pdf', b'%PDF-1.4 valid pdf content', 'application/pdf')),
        ('documents', ('doc2.jpeg', b'\xff\xd8\xff valid jpeg content', 'image/jpeg')),
        ('documents', ('doc3.png', b'\x89PNG\r\n\x1a\n valid png content', 'image/png'))
    ]

    # Test with valid payload and multiple documents
    try:
        response = requests.post(
            url,
            data=valid_data,
            files=valid_files_flat,
            timeout=timeout
        )
    except Exception as e:
        assert False, f"Valid data request failed with exception: {e}"
    assert response.status_code == 200, f"Expected 200 for valid registration, got {response.status_code}"
    json_resp = response.json()
    assert 'status' in json_resp or 'message' in json_resp, "Response missing expected keys"

    # Test with invalid file type (e.g., .exe) and expect 400 error
    invalid_files = [
        ('documents', ('malicious.exe', b'MZ\x90\x00\x03\x00\x00\x00', 'application/x-msdownload'))
    ]
    invalid_data = {
        'name': 'Jane Doe',
        'vehicle_reg_no': 'INVALID1',
        'metadata': '{"test": "invalid-file-type"}'
    }
    try:
        response_invalid_file = requests.post(
            url,
            data=invalid_data,
            files=invalid_files,
            timeout=timeout
        )
    except Exception as e:
        assert False, f"Invalid file type request failed with exception: {e}"
    assert response_invalid_file.status_code == 400, f"Expected 400 for invalid file type, got {response_invalid_file.status_code}"

    # Test with malformed data (missing required fields)
    malformed_data = {
        # missing 'name' and 'vehicle_reg_no'
        'metadata': '{"test": "malformed-data"}'
    }
    try:
        response_malformed = requests.post(
            url,
            data=malformed_data,
            timeout=timeout
        )
    except Exception as e:
        assert False, f"Malformed data request failed with exception: {e}"
    assert response_malformed.status_code == 400, f"Expected 400 for malformed data, got {response_malformed.status_code}"


test_user_registration_with_valid_and_invalid_data()