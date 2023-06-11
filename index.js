const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");

const stripe = require("stripe")(process.env.PAYMENT_GATEWAY_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

// Middleware for JWT Verification
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }
  // bearer token
  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

app.get("/", (req, res) => {
  res.send("Elegant Fashion Summer School is running.");
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.poiwoh3.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const usersCollection = client.db("elegantEdgeDB").collection("users");
    const instructorsCollection = client
      .db("elegantEdgeDB")
      .collection("instructors");
    const classesCollection = client.db("elegantEdgeDB").collection("classes");
    const paymentCollection = client.db("elegantEdgeDB").collection("payments");
    const selectedClassCollection = client
      .db("elegantEdgeDB")
      .collection("selectedClass");

    //  JWT
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });

      res.send({ token });
    });

    // Create User
    app.post("/users", async (req, res) => {
      const userInfo = req.body;
      const query = { email: userInfo.email };
      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: "User Already Exists" });
      }
      const result = await usersCollection.insertOne(userInfo);
      res.send(result);
    });

    app.get("/user", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // Instructors
    app.get("/instructors", async (req, res) => {
      const result = await instructorsCollection.find().toArray();

      res.send(result);
    });

    app.get("/instructors/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await instructorsCollection.findOne(filter);
      res.send(result);
    });

    // Selected Class
    app.post("/selectclass", async (req, res) => {
      const item = req.body;
      const result = await selectedClassCollection.insertOne(item);
      res.send(result);
    });

    app.get("/selectclass", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }

      const decodedEmail = req.decoded.email;

      if (email !== decodedEmail) {
        res.status(403).send({ error: true, message: "Forbidden Access." });
      }

      const filter = { userEmail: email };

      const result = await selectedClassCollection.find(filter).toArray();
      res.send(result);
    });

    app.get("/selectclass/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await selectedClassCollection.findOne(query);
      res.send(result);
    });

    app.delete("/selectclass/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await selectedClassCollection.deleteOne(query);
      res.send(result);
    });

    // Classes
    app.get("/classes", async (req, res) => {
      const email = req.query.email;
      if (!email) {
        const result = await classesCollection.find().toArray();
        res.send(result);
        return;
      }
      const filter = { email: email };
      const result = await classesCollection.find(filter).toArray();
      res.send(result);
    });

    // PAYMENT
    app.post("/payments", verifyJWT, async (req, res) => {
      const payment = req.body;
      console.log(payment);
      const selectedClassId = payment.selectedClassId;

      const filter = { _id: new ObjectId(selectedClassId) };
      const deleteResult = await selectedClassCollection.deleteOne(filter);

      const classId = payment.courseId;
      const query = { _id: new ObjectId(classId) };
      const doc = await classesCollection.findOne(query);

      const update = {
        $inc: {
          available_seats: -1,
          total_students: 1,
        },
      };
      const updateResult = await classesCollection.updateOne(query, update);

      const insertResult = await paymentCollection.insertOne(payment);
      res.send({ insertResult, deleteResult });
    });

    app.get("/payments", verifyJWT, async (req, res) => {
      const email = req.query.email;
      console.log(email);
      const filter = {
        user: email,
      };
      const result = await paymentCollection.find(filter).toArray();
      const courseIds = result.map((item) => item.courseId);
      const filterClasses = {
        _id: {
          $in: courseIds.map((id) => new ObjectId(id)),
        },
      };
      console.log(courseIds);
      const classes = await classesCollection.find(filterClasses).toArray();
      console.log(classes);
      res.send(classes);
    });

    // TODO: SEARCH WITH EMAIL
    app.get("/payment-history", async (req, res) => {
      const email = req.query.email;
      const filter = { user: email };
      const result = await paymentCollection.find(filter).toArray();
      result.sort((a, b) => new Date(b.date) - new Date(a.date));
      res.send(result);
    });

    // PAYMENT GATEWAY API
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Elegant Fashion Summer School is running on port: ${port}`);
});
