const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const Stripe = require('stripe');

const app = express();
app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// Cache connection
let dbConnected = false;
async function connectDB() {
    if (!dbConnected) {
        await client.connect();
        dbConnected = true;
    }
    return client.db(process.env.DB_NAME);
}

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// ---- Middleware ----
const verifySession = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    try {
        const db = await connectDB();
        const session = await db.collection('session').findOne({ token });
        if (!session) return res.status(401).json({ error: 'Invalid or expired session' });
        if (new Date(session.expiresAt) < new Date()) return res.status(401).json({ error: 'Session expired' });
        req.user = await db.collection('user').findOne({ _id: session.userId });
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Session verification failed' });
    }
};

const verifyAdmin = (req, res, next) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden - Admins only' });
    next();
};

// ---- Routes ----
app.get('/', (req, res) => res.send('Server is running'));

app.get('/api/properties', async (req, res) => {
    try {
        const db = await connectDB();
        const jobCollection = db.collection('property');
        const query = {};
        if (req.query.ownerId) query.ownerInformation = req.query.ownerId;
        if (req.query.location) query.location = { $regex: req.query.location, $options: 'i' };
        if (req.query.propertyType && req.query.propertyType !== 'All Types') query.propertyType = req.query.propertyType;

        let result = await jobCollection.find(query).toArray();
        if (req.query.sort === 'low-to-high') result.sort((a, b) => Number(a.rent) - Number(b.rent));
        else if (req.query.sort === 'high-to-low') result.sort((a, b) => Number(b.rent) - Number(a.rent));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch properties' });
    }
});

app.get('/api/properties/:id', async (req, res) => {
    try {
        const db = await connectDB();
        const result = await db.collection('property').findOne({ _id: new ObjectId(req.params.id) });
        res.json(result ?? {});
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch property' });
    }
});

app.post('/api/property', verifySession, async (req, res) => {
    try {
        const db = await connectDB();
        const result = await db.collection('property').insertOne(req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to add property' });
    }
});

app.put('/api/properties/:id', verifySession, async (req, res) => {
    try {
        const db = await connectDB();
        const result = await db.collection('property').updateOne({ _id: new ObjectId(req.params.id) }, { $set: req.body });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update property' });
    }
});

app.delete('/api/properties/:id', verifySession, async (req, res) => {
    try {
        const db = await connectDB();
        const result = await db.collection('property').deleteOne({ _id: new ObjectId(req.params.id) });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete property' });
    }
});

app.patch('/api/properties/:id/like', verifySession, async (req, res) => {
    try {
        const db = await connectDB();
        const jobCollection = db.collection('property');
        const favouriteCollection = db.collection('favourites');
        const propertyId = req.params.id;
        const { tenantId } = req.body;

        const existing = await favouriteCollection.findOne({ tenantId });
        if (existing) {
            const alreadyLiked = existing.likedHouses?.includes(propertyId);
            if (alreadyLiked) {
                await favouriteCollection.updateOne({ tenantId }, { $pull: { likedHouses: propertyId } });
                await jobCollection.updateOne({ _id: new ObjectId(propertyId) }, { $inc: { like: -1 } });
                return res.json({ liked: false });
            } else {
                await favouriteCollection.updateOne({ tenantId }, { $push: { likedHouses: propertyId } });
                await jobCollection.updateOne({ _id: new ObjectId(propertyId) }, { $inc: { like: 1 } });
                return res.json({ liked: true });
            }
        } else {
            await favouriteCollection.insertOne({ tenantId, likedHouses: [propertyId] });
            await jobCollection.updateOne({ _id: new ObjectId(propertyId) }, { $inc: { like: 1 } });
            return res.json({ liked: true });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to toggle like' });
    }
});

app.get('/api/favourites', verifySession, async (req, res) => {
    try {
        const db = await connectDB();
        const { tenantId } = req.query;
        const fav = await db.collection('favourites').findOne({ tenantId });
        if (!fav?.likedHouses?.length) return res.json([]);
        const properties = await db.collection('property').find({ _id: { $in: fav.likedHouses.map(id => new ObjectId(id)) } }).toArray();
        res.json(properties);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch favourites' });
    }
});

app.post('/api/ownerinfo', verifySession, async (req, res) => {
    try {
        const db = await connectDB();
        const result = await db.collection('owner').insertOne(req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to save owner info' });
    }
});

app.get('/api/ownerinfo', verifySession, async (req, res) => {
    try {
        const db = await connectDB();
        const query = {};
        if (req.query.userId) query.userId = req.query.userId;
        const result = await db.collection('owner').findOne(query);
        res.json(result ?? {});
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch owner info' });
    }
});

app.post('/api/booking', verifySession, async (req, res) => {
    try {
        const db = await connectDB();
        const result = await db.collection('booking').insertOne({ ...req.body, createAt: new Date() });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to book property' });
    }
});

app.get('/api/booking', verifySession, async (req, res) => {
    try {
        const db = await connectDB();
        const query = {};
        if (req.query.tenantUserId) query.tenantUserId = req.query.tenantUserId;
        if (req.query.ownerId) query.ownerId = req.query.ownerId;
        const result = await db.collection('booking').find(query).sort({ createAt: -1 }).toArray();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch bookings' });
    }
});

app.post('/api/create-payment-intent', verifySession, async (req, res) => {
    try {
        const { amount, currency } = req.body;
        const paymentIntent = await stripe.paymentIntents.create({ amount, currency: currency ?? 'bdt' });
        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/payments', verifySession, async (req, res) => {
    try {
        const db = await connectDB();
        const result = await db.collection('payments').insertOne(req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to save payment' });
    }
});

app.get('/api/payments', verifySession, async (req, res) => {
    try {
        const db = await connectDB();
        const query = {};
        if (req.query.tenantUserId) query.tenantUserId = req.query.tenantUserId;
        if (req.query.ownerId) query.ownerId = req.query.ownerId;
        const result = await db.collection('payments').find(query).sort({ paidAt: -1 }).toArray();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch payments' });
    }
});

app.get('/api/users', verifySession, verifyAdmin, async (req, res) => {
    try {
        const db = await connectDB();
        const result = await db.collection('user').find({}).toArray();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.patch('/api/users/:id/role', verifySession, verifyAdmin, async (req, res) => {
    try {
        const db = await connectDB();
        const { role } = req.body;
        const validRoles = ['admin', 'owner', 'tenant'];
        if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });
        const result = await db.collection('user').updateOne({ _id: new ObjectId(req.params.id) }, { $set: { role } });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update role' });
    }
});

module.exports = app;