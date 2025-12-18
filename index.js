const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET);

const app = express();
const port = process.env.PORT || 3000;


app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@mongo-simple-crud.tzwys72.mongodb.net/?appName=Mongo-simple-crud`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

async function run() {
    try {
        await client.connect();
        console.log("✅ Connected to MongoDB");

        const db = client.db("contestHub");
        const usersCollection = db.collection("users");
        const contestCollection = db.collection("contest");

        
        app.post("/users", async (req, res) => {
            const user = req.body;
            user.role = "user";
            user.createdAt = new Date();

            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        app.get("/users", async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        });

        app.patch("/users/:id", async (req, res) => {
            const { id } = req.params;
            const { role } = req.body;

            const result = await usersCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { role } }
            );
            res.send(result);
        });

        app.get("/users/profile", async (req, res) => {
            const email = req.query.email;
            if (!email) {
                return res.status(400).send({ message: "Email required" });
            }

            const user = await usersCollection.findOne({ email });
            res.send(user);
        });


        app.patch('/users/profile/:id', async (req, res) => {
            try {
                const email = req.query.email || req.body.email; 
                const { name, photoURL, address } = req.body;

                if (!email) return res.status(400).send({ message: "Email required" });

                const result = await usersCollection.updateOne(
                    { email },
                    { $set: { name, photoURL, address, updatedAt: new Date() } }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).send({ message: "User not found" });
                }

                res.send(result);
            } catch (err) {
                console.error("Update profile error:", err);
                res.status(500).send({ message: "Internal error" });
            }
        });





        // ==================================================
        // ================= CONTEST APIs ===================
        // ==================================================

        // Create contest
        app.post("/contest", async (req, res) => {
            const contest = req.body;
            contest.status = "pending";
            contest.participants = [];
            contest.participantsCount = 0;
            contest.createdAt = new Date();

            const result = await contestCollection.insertOne(contest);
            res.send(result);
        });

        // Get all contests
        app.get("/contest", async (req, res) => {
            try {
                const { type, status } = req.query;

                let query = {};

                // Search by contest type
                if (type) {
                    query.contestType = { $regex: type, $options: "i" };
                }

                // Optional: filter by status
                if (status) {
                    query.status = status;
                }

                const contests = await contestCollection.find(query).toArray();
                res.send(contests);
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: "Failed to fetch contests" });
            }
        });


        // Get single contest
        app.get("/contest/:id", async (req, res) => {
            const contest = await contestCollection.findOne({
                _id: new ObjectId(req.params.id),
            });
            res.send(contest);
        });
        // Update contest
        app.patch("/contest/:id", async (req, res) => {
            try {
                const { id } = req.params;
                const {
                    name,
                    image,
                    description,
                    price,
                    prizeMoney,
                    taskInstruction,
                    contestType,
                    deadline,
                } = req.body;

                const result = await contestCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $set: {
                            name,
                            image,
                            description,
                            price,
                            prizeMoney,
                            taskInstruction,
                            contestType,
                            deadline,
                            updatedAt: new Date(),
                        },
                    }
                );

                res.send(result);
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: "Failed to update contest" });
            }
        });



        // Approve contest
        app.patch("/contest/approve/:id", async (req, res) => {
            const result = await contestCollection.updateOne(
                { _id: new ObjectId(req.params.id) },
                { $set: { status: "approved" } }
            );
            res.send(result);
        });

        // Register contest
        app.patch("/contest/register/:id", async (req, res) => {
            const { id } = req.params;
            const { userId, userName, userEmail } = req.body;

            const contest = await contestCollection.findOne({
                _id: new ObjectId(id),
            });

            if (!contest) {
                return res.status(404).send({ message: "Contest not found" });
            }

            const alreadyRegistered = contest.participants.find(
                p => p.userId === userId
            );

            if (alreadyRegistered) {
                return res.status(400).send({ message: "Already registered" });
            }

            const result = await contestCollection.updateOne(
                { _id: new ObjectId(id) },
                {
                    $inc: { participantsCount: 1 },
                    $push: {
                        participants: {
                            userId,
                            userName,
                            userEmail,
                            registeredAt: new Date(),
                        },
                    },
                }
            );

            res.send(result);
        });

        // Submit contest task
        app.patch("/contest/submit-task/:id", async (req, res) => {
            try {
                const { id } = req.params;
                const { userEmail, taskName, taskSubmission } = req.body;

                if (!taskName || !taskSubmission || !userEmail) {
                    return res.status(400).send({ message: "Task name, submission, and user email are required" });
                }

                const contest = await contestCollection.findOne({ _id: new ObjectId(id) });

                if (!contest) {
                    return res.status(404).send({ message: "Contest not found" });
                }

                // Initialize tasks object if not exist
                const tasks = contest.tasks || {};

                // Initialize task array if taskName not exist
                if (!tasks[taskName]) tasks[taskName] = [];

                // Add user's submission
                const alreadySubmitted = tasks[taskName].some(t => t.userEmail === userEmail);
                if (alreadySubmitted) {
                    // Optional: Update existing submission
                    tasks[taskName] = tasks[taskName].map(t =>
                        t.userEmail === userEmail ? { userEmail, taskSubmission } : t
                    );
                } else {
                    tasks[taskName].push({ userEmail, taskSubmission });
                }

                // Update in DB
                const result = await contestCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { tasks } }
                );

                res.send({ message: "Task submitted successfully", tasks });
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: "Internal server error" });
            }
        });


        // Set contest winner
        // ================= Set Contest Winner =================
        app.patch("/contest/winner/:id", async (req, res) => {
            try {
                const { id } = req.params;
                const { userEmail, position, reward } = req.body;

                if (!userEmail || !position || !reward) {
                    return res.status(400).send({ message: "All fields required" });
                }

                const result = await contestCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $set: {
                            winner: {
                                userEmail,
                                position,
                                reward,
                                selectedAt: new Date(),
                            },
                        },
                    }
                );

                res.send(result);
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: "Failed to set winner" });
            }
        });


        // Delete contest
        app.delete("/contest/:id", async (req, res) => {
            const result = await contestCollection.deleteOne({
                _id: new ObjectId(req.params.id),
            });
            res.send(result);
        });

        // ==================================================
        // ================= CONTEST STATS ==================
        // ==================================================

        // User contest stats (Pie Chart)
        app.get("/contest-stats", async (req, res) => {
            const email = req.query.email;

            const participated = await contestCollection.countDocuments({
                "participants.userEmail": email,
            });

            const won = await contestCollection.countDocuments({
                "winner.userEmail": email,
            });

            res.send({ participated, won });
        });

        // ==================================================
        // ================= STRIPE PAYMENT =================
        // ==================================================

        app.post("/create-checkout-session", async (req, res) => {
            try {
                const paymentInfo = req.body;

                if (!paymentInfo?.cost) {
                    return res.status(400).send({ error: "Cost missing" });
                }

                const amount = Number(paymentInfo.cost) * 100;

                const session = await stripe.checkout.sessions.create({
                    payment_method_types: ["card"],
                    line_items: [
                        {
                            price_data: {
                                currency: "usd",
                                unit_amount: amount,
                                product_data: {
                                    name: `Contest Registration: ${paymentInfo.contestName}`,
                                },
                            },
                            quantity: 1,
                        },
                    ],
                    customer_email: paymentInfo.userEmail,
                    mode: "payment",
                    metadata: {
                        contestId: paymentInfo.contestId,
                        userId: paymentInfo.userId,
                        userName: paymentInfo.userName,
                        userEmail: paymentInfo.userEmail,
                    },
                    success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                    cancel_url: `${process.env.SITE_DOMAIN}/payment-cancelled`,
                });

                res.send({ url: session.url });
            } catch (error) {
                console.error("Stripe Error:", error.message);
                res.status(500).send({ error: error.message });
            }
        });


        // Payment success verify
        app.get("/payment-session/:sessionId", async (req, res) => {
            const session = await stripe.checkout.sessions.retrieve(
                req.params.sessionId
            );

            res.send({
                contestId: session.metadata.contestId,
                userEmail: session.metadata.userEmail,
            });
        });

    } finally {
        // keep server running
    }
}

run().catch(console.dir);

// ================= Root =================
app.get("/", (req, res) => {
    res.send("🚀 Contest Hub API Running");
});

app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});
