require("dns").setServers(["8.8.8.8", "8.8.4.4"]);
if (process.env.NODE_ENV !== "production") {
    require('dotenv').config()
}

const express = require("express");
const dbUrl = process.env.ATLASDB_URL;
const app= express();
const port = 3000;
const mongoose = require("mongoose");
const path= require("path");
// const Mongo_URL = "mongodb://127.0.0.1:27017/Wanderlust";
const Listing = require("./Models/listing.js");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const wrapAsync = require("./views/utils/wrapfn.js");
const ExpressErr=require("./views/utils/ExpressErr.js");
const Scehma = require("./Scehma.js");
const reviewSchema = Scehma.reviewSchema;
const Review=require("./Models/review.js");
const session = require("express-session");
const MongoStore = require('connect-mongo').default;
const flash= require("connect-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./Models/user.js");
const { isLoggedIn,isOwner,isAuthor } = require("./views/utils/authenticate.js");
const cloudinary = require("./cloudConfig");
const multer  = require('multer');

const upload = multer({
    storage: multer.memoryStorage()
});
const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");
const geocodingClient = mbxGeocoding({
    accessToken: process.env.MAP_TOKEN
});



app.use(methodOverride("_method"));
app.set("view engine" , "ejs");
app.set("views", path.join(__dirname,"views"));
app.use(express.urlencoded({extended : true}));
app.engine("ejs",ejsMate);
app.use(express.static(path.join(__dirname, "public")));

//Mongo sessionion store
const store = MongoStore.create({
    mongoUrl : dbUrl,
    crypto:{
        secret:process.env.SECRET
    },
    touchAfter: 24*3600,
});

store.on("error",() =>{
    console.log("ERROR in MONGO SESSION STORE" , err);
});


//session configuration
const sessionOption = {
    store,
    secret :process.env.SECRET,
    resave : false,
    saveUninitialized : true,
     cookie: {
     expires :Date.now() + 7*24*60*60*1000,
     maxAge : 7*24*60*60*1000,
     httpOnly :true
    },
};




//session and flash middleware
app.use(session(sessionOption));
app.use(flash());

//passport middleware
app.use(passport.initialize());
app.use(passport.session());


//passport configuration
passport.use(new LocalStrategy(User.authenticate()));

//serialize and deserialize user
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());



//middleware to pass flash messages and current user to all templates
app.use((req,res,next) =>{
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    res.locals.currentUser = req.user;
    next();
});



main() .then( () =>{
    console.log("connected to db");
}) .catch((err) =>{
    console.log("ERROR!",err);
});

async function main() {
  await mongoose.connect(dbUrl);
  
}


// Schema Validation middleware
const validateErr= ((req,res,next) =>{
     let {error} = Scehma.validate(req.body.listing);
     if(error){
        throw new ExpressErr(400, error);
     } else{
        next();
     }
});


//review validation middleware
const validateReview= ((req,res,next) =>{
     let {error} = reviewSchema.validate(req.body.review);
     if(error){
        throw new ExpressErr(400, error);
     } else{
        next();
     }
});


//Index route
app.get("/listings",
    wrapAsync (async(req,res)=>{
    const allListings = await Listing.find({});
    res.render("index.ejs" ,{allListings});
    
}));


//new route
app.get("/listings/new" , isLoggedIn, (req,res)=> {
    res.render("new.ejs"); 
});



//show route
app.get("/listings/:id" ,wrapAsync(async(req,res)=>{
    let {id} = req.params;
   const listing= await Listing.findById(id).populate({
    path : "reviews",
    populate : {
        path : "author"
    }
   })
   .populate("owner");
    let mapToken = process.env.MAP_TOKEN;
   res.render("show.ejs",{listing , mapToken});
}));



//create new route
app.post("/listings" , isLoggedIn,upload.single('image'), validateErr,
    wrapAsync(async(req,res,next)=>{

     const newListing= new Listing(req.body.listing);
      newListing.owner = req.user._id;

        // Forward geocoding
        const geoData = await geocodingClient.forwardGeocode({
            query: newListing.location,
            limit: 1
        }).send();

        //check whether the location is valid or not
          if (!geoData.body.features.length) {
            throw new ExpressErr(400, "Location not found!");
        }

        newListing.geometry = geoData.body.features[0].geometry;

        console.log("Coordinates:", geoData.body.features[0].geometry.coordinates);

         // Upload image to Cloudinary
        if (req.file) {
            const result = await cloudinary.uploader.upload(
                `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`
            );

            newListing.image = {
                filename: result.public_id,
                url: result.secure_url
            };
        }
  await newListing.save();
  req.flash("success","New Listing Created !");
  res.redirect("/listings");

}));


//edit route
app.get("/listings/:id/edit"
    , isLoggedIn,isOwner, wrapAsync(async(req,res)=>{
    let{id}=req.params;
    const listing = await Listing.findById(id);
    res.render("edit.ejs" ,{listing});
}));



//update route
app.put("/listings/:id", isLoggedIn,isOwner,upload.single('image'),
validateErr,
    wrapAsync(async(req,res)=>{
    let {id} = req.params;
   
    let listing =await Listing.findByIdAndUpdate(id ,{...req.body.listing }, {  returnDocument: "after" });
         
    // Update image if a new image was uploaded
        if (req.file) {

            const result = await cloudinary.uploader.upload(
                `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`
            );

            listing.image = {
                filename: result.public_id,
                url: result.secure_url
            };

            await listing.save();
        }

     req.flash("success","Listing Updated !");
    res.redirect(`/listings/${id}`);
}));


//delete listing
app.delete("/listings/:id" , isLoggedIn,isOwner, wrapAsync(async(req,res)=> {
     let {id} = req.params;
      let deletedListing = await Listing.findByIdAndDelete(id);
      console.log(deletedListing);
      req.flash("success","Listing Deleted !");
      res.redirect("/listings");
}));



//create review route
app.post("/listings/:id/reviews", isLoggedIn ,validateReview,
    wrapAsync(async(req,res)=>{
    let{id} = req.params;
    let listing = await Listing.findById(id);  
    let newReview= new Review(req.body.review);
    newReview.author = req.user._id;
    listing.reviews.push(newReview);
    
    await newReview.save();
    await listing.save();
    console.log("new review saved");
      req.flash("success","Review Added !");
    res.redirect(`/listings/${id}`);

}));


//Delete review route
app.delete("/listings/:id/reviews/:reviewId",isLoggedIn, 
    isAuthor,
    wrapAsync(async(req,res)=>{
    let{id,reviewId}= req.params;

 let result=await Listing.findByIdAndUpdate(id,{ $pull :{reviews : reviewId}});

     await Review.findByIdAndDelete(reviewId);
       req.flash("success","Review Deleted !");
    res.redirect(`/listings/${id}`);
}));



// creating a get route for signup
app.get("/register",wrapAsync((async(req,res) =>{
   res.render("users/signup.ejs");
})));



 //creating a post route for signup
app.post("/register", wrapAsync(async (req, res,next) => {

    try {
        let { username, password, email } = req.body;
        const newUser = new User({ username, email });
        const registeredUser = await User.register(newUser, password);
        console.log(registeredUser);
        req.login(registeredUser, (err) => {
            if (err) {
                return next(err);
            }
            req.flash("success", "Welcome to Roamly!");
            res.redirect("/listings");
          });
        
    } catch (err) {
        req.flash("error", err.message);
        res.redirect("/register");
    }

}));



// creating a get route for login
app.get("/login", (req, res) => {
    res.render("users/login.ejs");
});



//autihentication route for login
app.post("/login", passport.authenticate("local", 
    { failureRedirect: "/login", failureFlash: true }),
 wrapAsync(async(req, res) => {
    req.flash("success", "Welcome back!");
    res.redirect("/listings");
 }));



//logout route
app.get("/logout", (req, res, next) => {

    req.logout((err) => {
        if (err) {
            return next(err);
        }
        req.flash("success", "Logged out successfully!");
        res.redirect("/listings");
    });

});

//about route
app.get("/about", (req, res) => {
    res.render("about.ejs");
});


app.get("/listings", async (req, res) => {
    let { location, minPrice, maxPrice, propertyType, rating } = req.query;

    let filter = {};

    // Location filter
    if (location) {
        filter.location = { $regex: location, $options: "i" };
    }

    // Minimum price
    if (minPrice) {
        filter.price = { ...filter.price, $gte: Number(minPrice) };
    }

    // Maximum price
    if (maxPrice) {
        filter.price = { ...filter.price, $lte: Number(maxPrice) };
    }

    // Property type
    if (propertyType) {
        filter.propertyType = propertyType;
    }

    // Rating
    if (rating) {
        filter.rating = { $gte: Number(rating) };
    }

    let allListings = await Listing.find(filter);

    res.render("listings/index.ejs", { allListings });
});

//search route
app.get("/search", async (req, res) => {
    const { query } = req.query;

    const listings = await Listing.find({
        $or: [
            { title: { $regex: query, $options: "i" } },
            { location: { $regex: query, $options: "i" } },
            { country: { $regex: query, $options: "i" } }
        ]
    });

    res.render("index.ejs", { allListings: listings });
});



//catch all route
app.all("/{*splat}",(req,res,next) =>{
    next(new ExpressErr(404,"Page Not Found !"));
});




app.use((err,req,res,next)=>{
    let{statusCode=505,message="Something went wrong" }= err;
   res.render("layouts/err.ejs",{err});
    //   res.status(statusCode).send(message);

});

app.listen(3000 ,() =>{
    console.log("app is listening at port 3000 ")
});