const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { MongoClient, ServerApiVersion } = require('mongodb');

const Stripe = require('stripe');

const app = express();
const port = process.env.PORT || 3000;

const uri = process.env.MONGODB_URI;

// Middleware
app.use(cors());
app.use(express.json());

// Home route
app.get('/', (req, res) => {
    res.send('Server is running');
});



// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {

    // 59-2 -- 5.25min
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        const { ObjectId } = require('mongodb');

        const database = client.db(process.env.DB_NAME);
        const jobCollection = database.collection('property');
        const ownerCollection = database.collection('owner');
        const bookPopertyCollection = database.collection('booking');

        const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
        const paymentCollection = database.collection('payments');


        //payments
        app.post('/api/create-payment-intent', async (req, res) => {
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

        app.post('/api/payments', async (req, res) => {
            try {
                const result = await paymentCollection.insertOne(req.body);
                res.json(result);
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: 'Failed to save payment' });
            }
        })

        app.get('/api/payments', async (req, res) => {
            const query = {};
            if (req.query.tenantUserId) query.tenantUserId = req.query.tenantUserId;
            if (req.query.ownerId) query.ownerId = req.query.ownerId;
            const result = await paymentCollection.find(query).sort({ paidAt: -1 }).toArray();
            res.json(result);
        })

        app.get('/api/properties/:id', async (req, res) => {
            try {
                const result = await jobCollection.findOne({ _id: new ObjectId(req.params.id) });
                res.json(result ?? {});
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: 'Failed to fetch property' });
            }
        })


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
        app.post('/api/property', async (req, res) => {
            const job = req.body;
            const result = await jobCollection.insertOne(job);
            res.send(result);
        })

        app.post('/api/ownerinfo', async (req, res) => {
            const ownerinfo = req.body;
            const result = await ownerCollection.insertOne(ownerinfo);
            res.send(result);
        })

        app.put('/api/properties/:id', async (req, res) => {
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

        app.delete('/api/properties/:id', async (req, res) => {
            try {
                const { ObjectId } = require('mongodb');
                const result = await jobCollection.deleteOne({ _id: new ObjectId(req.params.id) });
                res.json(result);
            } catch (err) {
                res.status(500).json({ error: 'Failed to delete property' });
            }
        })

        //bbooking related
        app.post('/api/booking', async (req, res) => {
            const bookinginfo = req.body;
            const newBookinginfo = {
                ...bookinginfo,
                createAt: new Date()
            }
            const result = await bookPopertyCollection.insertOne(newBookinginfo);
            res.send(result);
        })

        app.get('/api/ownerinfo', async (req, res) => {
            const query = {};
            if (req.query.userId) {
                query.userId = req.query.userId;
            }
            const result = await ownerCollection.findOne(query);
            res.json(result ?? {});  // ← never send empty body
        })






        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");



    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }



}
run().catch(console.dir);


app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
