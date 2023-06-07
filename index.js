const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json())
app.use(cors());


app.get('/', (req, res) => {
    res.send('Elegant Fashion Summer School is running.')
})



app.listen(port, () => {
    console.log(`Elegant Fashion Summer School is running on port: ${port}`);
});
