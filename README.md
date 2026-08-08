👓 Vision Mart

Vision Mart is a full-stack eyewear e-commerce web application developed as a college project. 
The platform allows customers to browse and purchase eyewear products, manage their shopping cart and wishlist, place orders, and make payments through multiple payment methods.

It also includes an admin dashboard for managing products, categories, users, orders, and inventory.

✨ Features
🛍️ Customer Features
User registration and login
Browse eyewear products
Product categories
Product search and filtering
Product details
Shopping cart
Wishlist
Checkout
Multiple payment methods
Cash on Delivery
eSewa payment integration
Khalti payment integration
Order history
Order status tracking
Printable order invoice
Product stock management
🔐 Authentication & Security
User authentication
Admin authentication
JWT-based authentication
Password hashing
Role-based access control
Input validation
CORS configuration
Helmet security headers
SQL injection protection
Centralized error handling
🧑‍💼 Admin Dashboard
Dashboard overview
Product management
Add, edit and delete products
Product image upload
Category management
Category image upload
User management
Order management
Payment status management
Product stock management
Product status management
Search and filtering
💳 Payment Methods

Vision Mart supports:

Payment Method	Status
💵 Cash on Delivery	✅
🟢 eSewa	✅
🟣 Khalti	✅

For eSewa payments, payment verification is performed on the backend rather than trusting the browser redirect alone.

🛠️ Technologies Used
Frontend
HTML5
CSS3
JavaScript
Bootstrap 5
Bootstrap Icons
Backend
Node.js
Express.js
MySQL
JWT
bcrypt
Backend Packages
express
mysql2
dotenv
cors
helmet
bcrypt
jsonwebtoken
multer
express-validator
morgan
Payment Gateways
eSewa
Khalti
📁 Project Structure
ecommerce/
│
├── README.md
│
├── vm-frontend/
│   ├── assets/
│   ├── css/
│   ├── js/
│   ├── pages/
│   └── README.md
│
├── vm-backend/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   ├── uploads/
│   ├── server.js
│   ├── package.json
│   ├── .env.example
│   └── README.md
│
└── database/
    └── ...
🚀 Getting Started
1. Clone the repository
git clone https://github.com/Diwakar-lamichhane77/vision-mart.git
cd vision-mart
⚙️ Backend Setup

Go to the backend directory:

cd vm-backend

Install dependencies:

npm install

Create a .env file based on .env.example:

PORT=5000

DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=vision_mart

JWT_SECRET=your_jwt_secret

FRONTEND_URL=http://127.0.0.1:5500

ESEWA_MERCHANT_ID=EPAYTEST
ESEWA_URL=your_esewa_url
ESEWA_VERIFY_URL=your_esewa_verify_url
ESEWA_SUCCESS_URL=your_success_url
ESEWA_FAILURE_URL=your_failure_url

Start the backend:

npm run dev

The API will run on:

http://localhost:5000
🌐 Frontend Setup

Open the frontend directory:

cd vm-frontend

The frontend can be opened using VS Code Live Server.

For example:

http://127.0.0.1:5500/

Make sure the frontend API configuration points to:

http://localhost:5000/api
🗄️ Database

Vision Mart uses MySQL as its database.

The database contains data related to:

Users
Admins
Products
Categories
Cart
Wishlist
Orders
Order items
Payments

Create the database before starting the backend:

CREATE DATABASE vision_mart;

The complete database setup should be available in the project's database documentation.

🔒 Environment Variables

Sensitive information is not included in this repository.

The following should remain inside .env:

Database password
JWT secret
eSewa credentials
Khalti credentials
Other private configuration

The .env file is excluded using .gitignore.

Use .env.example as a template.

📚 Documentation

Detailed documentation is available in the individual project folders:

Frontend Documentation
Backend Documentation
🖥️ Main Modules
Customer
Home
 ↓
Products
 ↓
Product Details
 ↓
Cart
 ↓
Checkout
 ↓
Payment
 ↓
Orders
Admin
Admin Login
 ↓
Dashboard
 ├── Products
 ├── Categories
 ├── Orders
 └── Users
📸 Screenshots

Screenshots of the application can be added here.

Home Page

<img width="2281" height="1322" alt="image" src="https://github.com/user-attachments/assets/f6476e56-4462-47d2-a75a-f531ade9eb7e" />


Product Page

Add screenshot here

Shopping Cart

Add screenshot here

Checkout

Add screenshot here

Admin Dashboard

Add screenshot here


📄 License

This project was developed for educational/academic purposes.
