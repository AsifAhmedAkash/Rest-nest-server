RESTNET Backend API

A Node.js + Express + MongoDB backend for the RESTNET Property Rental & Booking Platform.

Features
Session-based Authentication
Role-based Authorization
Property Management
Property Favorites System
Booking Management
Stripe Payment Integration
Owner Management
User Management
Admin Role Control
MongoDB Database
Tech Stack
Backend
Node.js
Express.js
MongoDB
Stripe
dotenv
cors
Installation
Clone Repository
git clone https://github.com/yourusername/restnet-server.git

cd restnet-server
Install Dependencies
npm install
Start Server
npm start

or

node index.js
Environment Variables

Create a .env file in the root directory.

PORT=3000

MONGODB_URI=your_mongodb_connection_string

DB_NAME=restnet

STRIPE_SECRET_KEY=your_stripe_secret_key
Database Collections

The backend uses the following MongoDB collections:

property
owner
booking
user
session
payments
favourites
Authentication

The API uses session validation middleware.

Protected routes require:

Authorization: Bearer <token>

The token is checked against the session collection.

API Endpoints
Home Route
GET /

Check server status.

GET /

Response

{
  "message": "Server is running"
}
Property Routes
Get All Properties
GET /api/properties
Query Parameters
Parameter	Description
ownerId	Filter by owner
location	Search location
propertyType	Filter by type
sort	low-to-high / high-to-low

Example

GET /api/properties?location=Dhaka
Get Single Property
GET /api/properties/:id

Returns property details.

Create Property
POST /api/property

Protected Route

Creates a new property listing.

Update Property
PUT /api/properties/:id

Protected Route

Updates property information.

Delete Property
DELETE /api/properties/:id

Protected Route

Deletes a property.

Favorites System
Like / Unlike Property
PATCH /api/properties/:id/like

Protected Route

Automatically toggles favorite status.

Request Body

{
  "tenantId": "tenant_user_id"
}

Behavior

Adds property to favorites
Removes property from favorites
Updates property like count
Get Favorite Properties
GET /api/favourites

Protected Route

Query:

/api/favourites?tenantId=USER_ID

Returns all favorite properties of a tenant.

Booking Routes
Create Booking
POST /api/booking

Protected Route

Creates a booking record.

Automatically adds:

createdAt: new Date()
Get Bookings
GET /api/booking

Protected Route

Filters

Parameter	Description
tenantUserId	Tenant bookings
ownerId	Owner bookings

Example

GET /api/booking?tenantUserId=123
Owner Routes
Create Owner Profile
POST /api/ownerinfo

Protected Route

Creates owner information.

Get Owner Information
GET /api/ownerinfo

Protected Route

Example

/api/ownerinfo?userId=123

Returns owner profile data.

Payment Routes
Create Stripe Payment Intent
POST /api/create-payment-intent

Protected Route

Request

{
  "amount": 5000,
  "currency": "bdt"
}

Response

{
  "clientSecret": "secret_key"
}
Save Payment
POST /api/payments

Protected Route

Stores completed payment information.

Get Payments
GET /api/payments

Protected Route

Filters

Parameter	Description
tenantUserId	Tenant payments
ownerId	Owner payments

Example

GET /api/payments?ownerId=123
Admin Routes

Only accessible by users with:

{
  "role": "admin"
}
Get All Users
GET /api/users

Protected Route

Admin Only

Returns all registered users.

Change User Role
PATCH /api/users/:id/role

Protected Route

Admin Only

Request

{
  "role": "owner"
}

Valid Roles

admin
owner
tenant
Authorization Flow
User Login
    ↓
Token Generated
    ↓
Stored in Session Collection
    ↓
Client Sends Token
    ↓
verifySession Middleware
    ↓
Access Granted
Stripe Payment Flow
Tenant Books Property
        ↓
Create Payment Intent
        ↓
Stripe Checkout
        ↓
Payment Success
        ↓
Save Payment Record
        ↓
Booking Confirmed
Project Structure
server
│
├── index.js
├── .env
├── package.json
│
├── middleware
│
├── routes
│
├── controllers
│
└── database

(Current implementation is inside a single index.js file.)

Future Improvements
JWT Authentication
Refresh Tokens
Property Approval System
Review System
Pagination
Analytics API
PDF Report Generation
Email Notifications
Booking Approval Workflow
Author

Asif Ahmed Akash Ankon

GitHub: https://github.com/AsifAhmedAkash