const mongoose = require("mongoose");
const initData = require("./data.js");
const Listing = require("../Models/listing.js");

const Mongo_URL = "mongodb://127.0.0.1:27017/Wanderlust";

main() .then( () =>{
    console.log("connected to db");
}) .catch((err) =>{
    console.log("ERROR!",err);
});

async function main() {
  await mongoose.connect(Mongo_URL);
  
}

const initDB = async()=> {
    await Listing.deleteMany({});
    initData.data = initData.data.map((obj)=>({
        ...obj,
        owner: "6a971d99ce34098008300359" // Replace with actual user ID
    }));
    await Listing.insertMany(initData.data);
    console.log("intiallized");
}

initDB();

