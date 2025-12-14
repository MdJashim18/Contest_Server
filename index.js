const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@mongo-simple-crud.tzwys72.mongodb.net/?appName=Mongo-simple-crud`;
const client = new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

async function run() {
    try {
        await client.connect();
        console.log("Connected to MongoDB!");

        const db = client.db("contestHub");
        const usersCollection = db.collection("users");
        const contestCollection = db.collection("contest")

        // ================= POST new user =================
        app.post("/users", async (req, res) => {
            const user = req.body
            user.role = "user"
            user.createdAt = new Date()

            const result = await usersCollection.insertOne(user)
            res.send(result)
        });
        app.get("/users", async (req, res) => {
            const cursor = usersCollection.find()
            const result = await cursor.toArray()
            res.send(result)
        })
        app.patch('/users/:id', async (req, res) => {
            const { id } = req.params;
            const { role } = req.body;
            const result = await usersCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { role } }
            );
            res.send(result);
        });




        app.post("/contest", async (req, res) => {
            const contest = req.body;
            contest.status = "pending";
            contest.participants = 0;
            contest.createdAt = new Date();
            const result = await contestCollection.insertOne(contest);
            res.send(result);
        })
        app.get("/contest", async (req, res) => {
            const cursor = contestCollection.find()
            const result = await cursor.toArray()
            res.send(result)
        });
        app.get("/contest/:id", async (req, res) => {
            const contest = await contestCollection.findOne({
                _id: new ObjectId(req.params.id),
            });
            res.send(contest);
        });
        app.patch("/contest/approve/:id", async (req, res) => {
            const result = await contestCollection.updateOne(
                { _id: new ObjectId(req.params.id) },
                { $set: { status: "approved" } }
            );
            res.send(result);
        }
        );
        // PATCH /contest/register/:id
        app.patch("/contest/register/:id", async (req, res) => {
            const { id } = req.params;
            const { userId, userName, userEmail } = req.body;

            const contest = await contestCollection.findOne({ _id: new ObjectId(id) });
            if (!contest) return res.status(404).send({ message: "Contest not found" });

            // Prevent double registration
            const alreadyRegistered = contest.participants.find(p => p.userId === userId);
            if (alreadyRegistered) return res.status(400).send({ message: "Already registered" });

            const updated = await contestCollection.updateOne(
                { _id: new ObjectId(id) },
                {
                    $inc: { participantsCount: 1 },
                    $push: { participants: { userId, userName, userEmail, registeredAt: new Date() } }
                }
            );

            res.send({ status: "success", updated });
        });

        // PATCH /contest/submit-task/:id
        app.patch("/contest/submit-task/:id", async (req, res) => {
            const { id } = req.params;
            const { userId, taskSubmission } = req.body;

            const contest = await contestCollection.findOne({ _id: new ObjectId(id) });
            if (!contest) return res.status(404).send({ message: "Contest not found" });

            const participants = contest.participants.map(p => {
                if (p.userId === userId) {
                    return { ...p, taskSubmission };
                }
                return p;
            });

            const updated = await contestCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { participants } }
            );

            res.send(updated);
        });
        // PATCH /contest/winner/:id
        app.patch("/contest/winner/:id", async (req, res) => {
            const { id } = req.params;
            const { userId, name, photo } = req.body;

            const updated = await contestCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { winner: { userId, name, photo } } }
            );

            res.send(updated);
        });



        app.delete("/contest/:id", async (req, res) => {
            const result = await contestCollection.deleteOne({
                _id: new ObjectId(req.params.id),
            });
            res.send(result);
        }
        );







        // app.post('/create-checkout-session', async (req, res) => {
        //     const paymentInfo = req.body
        //     const amount = parseInt(paymentInfo.cost)*100

        //     const session = await stripe.checkout.sessions.create({
        //         line_items: [
        //             {
        //                 // Provide the exact Price ID (for example, price_1234) of the product you want to sell
        //                 price_data: {
        //                     currency : "USD",
        //                     unit_amount : amount,
        //                     product_data : {
        //                         name : `Please pay for ${paymentInfo.parcelName}`
        //                     }
        //                 },

        //                 quantity: 1,
        //             },
        //         ],
        //         User_email:paymentInfo.email,
        //         mode: 'payment',
        //         metadata : {
        //             contestId : paymentInfo._id
        //         },
        //         success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        //         cancel_url: `${process.env.SITE_DOMAIN}/payment-cancelled`,
        //     });

        //     console.log(session)
        //     res.send({ url : session.url })
        // })


        app.post('/create-checkout-session', async (req, res) => {
            const paymentInfo = req.body;
            const amount = parseInt(paymentInfo.cost) * 100;

            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [
                    {
                        price_data: {
                            currency: 'usd',
                            unit_amount: amount,
                            product_data: {
                                name: `Contest Registration: ${paymentInfo.contestName}`,
                            },
                        },
                        quantity: 1,
                    },
                ],
                customer_email: paymentInfo.userEmail,
                mode: 'payment',
                metadata: {
                    contestId: paymentInfo.contestId,
                    userId: paymentInfo.userId,
                    userName: paymentInfo.userName,
                    userEmail: paymentInfo.userEmail
                },
                success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.SITE_DOMAIN}/payment-cancelled`,
            });

            res.send({ url: session.url });
        });

        app.get('/payment-session/:sessionId', async (req, res) => {
            const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);

            res.send({
                contestId: session.metadata.contestId,
                userEmail: session.metadata.userEmail
            });
        });





    } finally {
        // Do not close client to keep server running
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Contest Hub API');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
