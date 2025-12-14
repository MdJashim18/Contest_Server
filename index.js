const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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
        app.patch("/contest/reject/:id", async (req, res) => {
            const result = await contestCollection.updateOne(
                { _id: new ObjectId(req.params.id) },
                { $set: { status: "rejected" } }
            );
            res.send(result);
        }
        );
        app.delete("/contest/:id",async (req, res) => {
                const result = await contestCollection.deleteOne({
                    _id: new ObjectId(req.params.id),
                });
                res.send(result);
            }
        );


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
