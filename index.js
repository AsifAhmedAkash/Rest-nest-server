const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { MongoClient, ServerApiVersion } = require('mongodb');

const Stripe = require('stripe');

const app = express();
const port = process.env.PORT || 3000;

const uri = process.env.MONGODB_URI;


app.use(cors());
app.use(express.json());


app.get('/', (req, res) => {
    res.send('Server is running');
});




const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {


    try {

        await client.connect();
        const { ObjectId } = require('mongodb');

        const database = client.db(process.env.DB_NAME);
        const jobCollection = database.collection('property');
        const ownerCollection = database.collection('owner');
        const bookPopertyCollection = database.collection('booking');
        const userCollection = database.collection('user');
        const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
        const paymentCollection = database.collection('payments');
        const favouriteCollection = database.collection('favourites');

        const verifySession = async (req, res, next) => {
            const authHeader = req.headers['authorization'];
            if (!authHeader?.startsWith('Bearer ')) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const token = authHeader.split(' ')[1];

            try {
                const session = await database.collection('session').findOne({ token });
                // console.log('session:', session);
                if (!session) {
                    return res.status(401).json({ error: 'Invalid or expired session' });
                }

                // optionally check expiry
                if (new Date(session.expiresAt) < new Date()) {
                    return res.status(401).json({ error: 'Session expired' });
                }

                // attach user info to request
                const user = await database.collection('user').findOne({ _id: session.userId });
                // console.log('user:', user);
                req.user = user;
                next();
            } catch (err) {
                console.error(err);
                return res.status(401).json({ error: 'Session verification failed' });
            }
        };

        const verifyAdmin = (req, res, next) => {

            console.log("req.user:", req.user);
            if (req.user?.role !== 'admin') {
                return res.status(403).json({ error: 'Forbidden - Admins only' });
            }
            next();
        };

        //payments
        app.post('/api/create-payment-intent', verifySession, async (req, res) => {
            try {
                const { amount, currency } = req.body;
                const paymentIntent = await stripe.paymentIntents.create({
                    amount,
                    currency: currency ?? 'bdt',
                });
                res.json({ clientSecret: paymentIntent.client_secret });
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: err.message });
            }
        })

        app.post('/api/payments', verifySession, async (req, res) => {
            try {
                const result = await paymentCollection.insertOne(req.body);
                res.json(result);
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: 'Failed to save payment' });
            }
        })

        app.get('/api/payments', verifySession, async (req, res) => {
            const query = {};
            if (req.query.tenantUserId) query.tenantUserId = req.query.tenantUserId;
            if (req.query.ownerId) query.ownerId = req.query.ownerId;
            const result = await paymentCollection.find(query).sort({ paidAt: -1 }).toArray();
            res.json(result);
        })
        //public
        app.get('/api/properties/:id', async (req, res) => {
            try {
                const result = await jobCollection.findOne({ _id: new ObjectId(req.params.id) });
                res.json(result ?? {});
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: 'Failed to fetch property' });
            }
        })


        //public
        app.get('/api/properties', async (req, res) => {
            const query = {};
            if (req.query.ownerId) query.ownerInformation = req.query.ownerId;
            if (req.query.location) query.location = { $regex: req.query.location, $options: 'i' };
            if (req.query.propertyType && req.query.propertyType !== 'All Types') {
                query.propertyType = req.query.propertyType;
            }

            let result = await jobCollection.find(query).toArray();

            if (req.query.sort === 'low-to-high') {
                result.sort((a, b) => Number(a.rent) - Number(b.rent));
            } else if (req.query.sort === 'high-to-low') {
                result.sort((a, b) => Number(b.rent) - Number(a.rent));
            }

            res.send(result);
        })
        app.post('/api/property', verifySession, async (req, res) => {
            const job = req.body;
            const result = await jobCollection.insertOne(job);
            res.send(result);
        })

        app.patch('/api/properties/:id/like', verifySession, async (req, res) => {
            console.log('HIT like route', req.params.id, req.body);
            try {
                const { ObjectId } = require('mongodb');
                const propertyId = req.params.id;
                const { tenantId } = req.body;

                // check if already liked
                const existing = await favouriteCollection.findOne({ tenantId });
                console.log('existing favourite doc:', existing);
                if (existing) {
                    const alreadyLiked = existing.likedHouses?.includes(propertyId);
                    console.log('likedHouses:', existing.likedHouses, '| alreadyLiked:', alreadyLiked);
                    if (alreadyLiked) {
                        // unlike — remove from array and decrement
                        await favouriteCollection.updateOne(
                            { tenantId },
                            { $pull: { likedHouses: propertyId } }
                        );
                        await jobCollection.updateOne(
                            { _id: new ObjectId(propertyId) },
                            { $inc: { like: -1 } }
                        );
                        return res.json({ liked: false });
                    } else {
                        // like — add to array and increment
                        await favouriteCollection.updateOne(
                            { tenantId },
                            { $push: { likedHouses: propertyId } }
                        );
                        await jobCollection.updateOne(
                            { _id: new ObjectId(propertyId) },
                            { $inc: { like: 1 } }
                        );
                        return res.json({ liked: true });
                    }
                } else {
                    // first time liking anything
                    await favouriteCollection.insertOne({
                        tenantId,
                        likedHouses: [propertyId]
                    });
                    await jobCollection.updateOne(
                        { _id: new ObjectId(propertyId) },
                        { $inc: { like: 1 } }
                    );
                    return res.json({ liked: true });
                }
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: 'Failed to toggle like' });
            }
        })

        app.post('/api/ownerinfo', verifySession, async (req, res) => {
            const ownerinfo = req.body;
            const result = await ownerCollection.insertOne(ownerinfo);
            res.send(result);
        })

        app.put('/api/properties/:id', verifySession, async (req, res) => {
            try {
                const { ObjectId } = require('mongodb');
                const result = await jobCollection.updateOne(
                    { _id: new ObjectId(req.params.id) },
                    { $set: req.body }
                );
                res.json(result);
            } catch (err) {
                res.status(500).json({ error: 'Failed to update property' });
            }
        })

        app.delete('/api/properties/:id', verifySession, async (req, res) => {
            try {
                const { ObjectId } = require('mongodb');
                const result = await jobCollection.deleteOne({ _id: new ObjectId(req.params.id) });
                res.json(result);
            } catch (err) {
                res.status(500).json({ error: 'Failed to delete property' });
            }
        })

        //bbooking related
        app.post('/api/booking', verifySession, async (req, res) => {
            const bookinginfo = req.body;
            const newBookinginfo = {
                ...bookinginfo,
                createAt: new Date()
            }
            const result = await bookPopertyCollection.insertOne(newBookinginfo);
            res.send(result);
        })

        app.get('/api/ownerinfo', verifySession, async (req, res) => {
            const query = {};
            if (req.query.userId) {
                query.userId = req.query.userId;
            }
            const result = await ownerCollection.findOne(query);
            res.json(result ?? {});  // ← never send empty body
        })

        app.get('/api/favourites', verifySession, async (req, res) => {
            try {
                const { ObjectId } = require('mongodb');
                const { tenantId } = req.query;
                const fav = await favouriteCollection.findOne({ tenantId });
                if (!fav?.likedHouses?.length) return res.json([]);

                const properties = await jobCollection.find({
                    _id: { $in: fav.likedHouses.map(id => new ObjectId(id)) }
                }).toArray();

                res.json(properties);
            } catch (err) {
                res.status(500).json({ error: 'Failed to fetch favourites' });
            }
        })



        //for admin use
        app.get('/api/users', verifySession, verifyAdmin, async (req, res) => {
            try {
                const result = await userCollection.find({}).toArray();
                res.json(result);
            } catch (err) {
                res.status(500).json({ error: 'Failed to fetch users' });
            }
        });

        // chng role
        app.patch('/api/users/:id/role', verifySession, verifyAdmin, async (req, res) => {
            try {
                const { role } = req.body;
                const validRoles = ['admin', 'owner', 'tenant'];
                if (!validRoles.includes(role)) {
                    return res.status(400).json({ error: 'Invalid role' });
                }
                const result = await userCollection.updateOne(
                    { _id: new ObjectId(req.params.id) },
                    { $set: { role } }
                );
                res.json(result);
            } catch (err) {
                res.status(500).json({ error: 'Failed to update role' });
            }
        });

        // GET all bookings 
        app.get('/api/booking', verifySession, async (req, res) => {
            try {
                const query = {};
                // Optional per-user filters (reused for owner/tenant dashboards too)
                if (req.query.tenantUserId) query.tenantUserId = req.query.tenantUserId;
                if (req.query.ownerId) query.ownerId = req.query.ownerId;
                const result = await bookPopertyCollection
                    .find(query)
                    .sort({ createAt: -1 })
                    .toArray();
                res.json(result);
            } catch (err) {
                res.status(500).json({ error: 'Failed to fetch bookings' });
            }
        });

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");



    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }



}
run().catch(console.dir);


module.exports = app;
