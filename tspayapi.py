import requests
import json

def get_access_token(email, password):
    api_url = 'https://tspay.uz/api/v1/auth/login/'
    data = {
        'email': email,
        'password': password
    }
    response = requests.post(api_url, json=data)
    return response.json().get('access_token')

def get_shop_access_token(access_token):
    api_url = 'https://tspay.uz/api/v1/shops/access-token/'
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }
    response = requests.get(api_url, headers=headers)
    return response.json()['shops'][0]['access_token'] #kerakli do'kon access tokenini olish

def create_payment(shop_access_token, amount, description):
    api_url = 'https://tspay.uz/api/v1/transactions/create/'
    data = {
        'amount': amount,
        'access_token': shop_access_token,
        'description': description
    }
    response = requests.post(api_url, json=data)
    transaction = response.json()['transaction']
    return transaction['payment_url'], transaction['cheque_id']

def check_payment_status(shop_access_token, transaction_id):
    api_url = f'https://tspay.uz/api/v1/transactions/{transaction_id}/'
    headers = {
        'Authorization': f'Bearer {shop_access_token}',
        'Content-Type': 'application/json'
    }
    response = requests.get(api_url, headers=headers)
    return response.json()['status']


user_token = get_access_token('Foydalanuvchi emaili', 'Parol')
print(f"User Access Token: {user_token}")

shop_token = get_shop_access_token(user_token)
print(f"Shop Access Token: {shop_token}")

payment_url, transaction_id = create_payment(shop_token, 1000, 'Test payment')
print(f"Payment URL: {payment_url}, Transaction ID: {transaction_id}")

status = check_payment_status(user_token, transaction_id)
print(f"Payment Status: {status}")