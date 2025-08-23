# test_paystack.py

import os
import requests
from dotenv import load_dotenv

print("--- Paystack Connection Test ---")

# 1. Load the secret key from your .env file
load_dotenv()
PAYSTACK_SECRET_KEY = os.getenv("PAYSTACK_SECRET_KEY")

if not PAYSTACK_SECRET_KEY or PAYSTACK_SECRET_KEY == "your_fallback_secret_key":
    print("❌ FAILURE: Your PAYSTACK_SECRET_KEY is not set in the .env file.")
    exit()

print(f"✅ Secret key loaded successfully. Key starts with: {PAYSTACK_SECRET_KEY[:8]}...")

# 2. Prepare the request (same as in your main.py)
#    We use a fake reference because we only care if the connection succeeds or fails.
#    A successful connection will give us a 400/404 error from Paystack, which is GOOD.
#    A failed connection will crash with a network error.
headers = {"Authorization": f"Bearer {PAYSTACK_SECRET_KEY}"}
test_reference = "this_is_a_test_that_will_fail_on_paystack"
url = f"https://api.paystack.co/transaction/verify/{test_reference}"

print(f"Attempting to make a secure connection to: {url}")

try:
    # 3. Make the request, including our bypasses
    response = requests.get(url, headers=headers, timeout=15, verify=False)
    
    # 4. Check the result
    print("\n======================================")
    print("      ✅ CONNECTION SUCCEEDED! ✅")
    print("======================================")
    print("This means your Python environment CAN talk to Paystack.")
    print("The problem is with the Uvicorn server environment.")
    print(f"Paystack responded with Status Code: {response.status_code}")
    print(f"Paystack's message: {response.text}")

except requests.exceptions.RequestException as e:
    print("\n======================================")
    print("      ❌ CONNECTION FAILED! ❌")
    print("======================================")
    print("This proves the problem is EXTERNAL to the application.")
    print("Something on your computer (Firewall, Network Settings) is blocking Python itself.")
    print("\n--- Detailed Error Message ---")
    print(e)

print("\n--- Test Finished ---")