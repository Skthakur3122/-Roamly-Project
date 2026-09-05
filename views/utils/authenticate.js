const Listing = require("../../Models/listing.js");
const Review = require("../../Models/review.js");
module.exports.isLoggedIn = function(req,res,next){
    if(!req.isAuthenticated()){
        req.flash("error","First you need to login");
        return res.redirect("/login");
    }
    next();
}

module.exports.isOwner = async function(req,res,next){
    let {id} = req.params;
    let listing = await Listing.findById(id);
    if(!listing.owner.equals(req.user._id)){
        req.flash("error","You don't have permission to make changes to this listing!");
        return res.redirect(`/listings/${id}`);
    }
    next();
}

module.exports.isAuthor = async function(req,res,next){
    let {id,reviewId} = req.params;
    let review = await Review.findById(reviewId); 
    if(!review.author.equals(req.user._id)){
        req.flash("error","You don't have permission to make changes to this review!");
        return res.redirect(`/listings/${id}`);
    }
    next();
}
