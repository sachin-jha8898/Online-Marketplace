const express = require("express");
const mongo = require("mongoose");
const session = require('express-session');
const dbConfiguration = require("./setup/config");
const { buyerMail, partialMail } = require("./utils/email");
const ejs = require("ejs");
const port = process.env.PORT || 5500;
const host = "127.0.0.1";

// Import Tables !
const User = require("./tables/User");
const OrderBook = require("./tables/OrderBook");
const Products = require("./tables/Admin");

// Include Order Matching Algorithm 
const createOrderBook_result = require("./utils/ordermatch");
const pricetimepriorty = require("./utils/pricetimepriorty");

// Connect our Mongo DB Database !
mongo.connect(dbConfiguration.url) //Why using then-catch, to avoid code crash and
    .then(() => { //If successfully resolved !
        console.log("Database Successfully connected !");
    })
    .catch(err => {  //If any error occurs !
        console.log("Error: error in connecting with database !", err);
    });

// Initialising express app
let app = express();

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(__dirname + "/client"));

app.set("view engine", "ejs");

app.set('trust proxy', 1) // trust first proxy
app.use(session({
    name: "user",
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, httpOnly: true, path: "/" }
}))

// Protected Functions !

function unauthenticated(request, response, next) {
    console.log(request.session);

    if (request.session.email != undefined || request.session.adminAccess) {
        next();
    } else {
        response.redirect("/login");
    }
}

function authenticated(request, response, next) {
    if (request.session.email) {
        response.redirect("/dashboard");
    } else if (request.session.adminAccess) {
        response.redirect("/admin");
    } else {
        next();
    }
}



// Create Partial Data Array !
let partialData = [];

// Routes
// type - GET
// route - /home
// ip:port/home
// app.use("/",express.static(__dirname + "/client"));

app.get("/", (request, response) => {
    response.render("landing");
})

app.get("/dashboard", (request, response) => {

    let sessionStatus = false;

    if (request.session.email != undefined) sessionStatus = true;

    Products.find()
        .then((products) => {
            response.render("index", { sessionStatus, products });
        })
        .catch(err => console.log("Error: ", err));
})

app.get("/register", authenticated, (request, response) => {
    console.log(request.session);
    response.render("register");
});


app.get("/login", authenticated, (request, response) => {
    response.render("login");
});

app.post("/register", (request, response) => {
    console.log(request.body);

    const { name, email, password } = request.body;

    // Query Database

    User.findOne({ email: email })
        .then((person) => {
            if (person) {
                // If email already exists !, our email matches with any mail in the document 
                response.status(503).json({
                    "message": "Email ID already registered",
                    responseCode: 503
                })
            } else {
                // This is our first time user, so save his/her data !
                // @TODO - ADD TIMESTAMP
                let userObj = {
                    name: name,
                    email: email,
                    password: password,
                    portfolio: []
                }

                new User(userObj).save()
                    .then((user) => {
                        console.log("User registered successfully !");

                        request.session.user_name = user.name;
                        request.session.email = user.email;
                        request.session.password = user.password;

                        console.log("Session: ");
                        console.log(request.session);

                        response.status(200).json({
                            responseCode: 200,
                            access: "user"
                        });
                    })
                    .catch(err => console.log("Error: ", err));
            }
        })
        .catch(err => console.log("Error: ", err));


})

app.post("/login", (request, response) => {
    console.log(request.body);

    const { email, password } = request.body;

    if (email === "admin@onlinemarket" || password === "000") {
        request.session.adminAccess = true;
        response.json({
            responseCode: 200,
            access: "admin"
        })
    } else {

        // Query Database

        User.findOne({ email: email })
            .then((person) => {
                if (person) {
                    // Match password 
                    if (password === person.password) {
                        console.log("Success Entry !");
                        request.session.user_name = person.name;
                        request.session.email = person.email;
                        request.session.password = person.password;

                        console.log("Session: ");
                        console.log(request.session);

                        // response.status(200).redirect("/");

                        response.status(200).json({
                            responseCode: 200,
                            access: "user"
                        })
                    } else {
                        response.status(503).json({
                            responseCode: 503,
                            access: "user"
                        })
                    }
                } else {
                    console.log("Email not registered !");
                    response.status(503).json({
                        responseCode: 503
                    })
                }
            })
            .catch(err => console.log("Error: ", err));

    }

})

app.get("/portfolio", unauthenticated, (request, response) => {
    User.findOne({ email: request.session.email })
        .then((user) => {
            response.render("portfolio", { portfolio: user.portfolio });
        })
        .catch(err => console.log("Error: ", err));
})

app.get("/placeorder", unauthenticated, (request, response) => {
    const name = request.query.name;
    const type = request.query.type;
    const price = request.query.price;

    response.render("bidform", { type, name, price });
})

app.post("/adminData", (request, response) => {
    let { name,imgurl, base_price, base_quantity } = request.body;
    name = name.toLowerCase();
    base_price = Number(base_price);
    base_quantity = Number(base_quantity);

    if (name != "" && base_price != "" && base_quantity != "") {
        // Add products in seller data !
        // Step-1 : Will check for product name uniqueness
        // Step-2 : Add user as a seller in seller table
        // Step-3 : Store same product in products table simultaneously!
        Products.findOne({ name: name })
            .then((product) => {
                if (product) {
                    response.status(503).json({
                        message: "Product already exists !"
                    })
                } else {
                    // Create new Document for seller

                    let productObject = {
                        name: name,
                        imgurl : imgurl,
                        base_price: base_price,
                        base_quantity: base_quantity
                    }

                    new Products(productObject).save()
                        .then(() => {

                            response.status(200).json({
                                message: "Success ✔"
                            })

                        })
                        .catch(err => console.log("Error: ", err));
                }
            })
            .catch(err => console.log("Error: ", err));
    } else {
        response.status(503).json({
            message: "Values Missing !!!"
        })
    }
});

// Calculate quantity function 
function calculateQuantity(price, base_price) {
    return price / base_price;
}

// Calculate price function
function calculatePrice(base_price, quantity) {
    return base_price * quantity;
}

// Route for order placing in mongodb
app.post("/place", unauthenticated, (request, response) => {
    console.log("Placed Body: ");
    console.log(request.body);
    let calculatedEntity;
    var buyOrder_success = false;

    Products.findOne({ name: request.body.name })
        .then((product) => {

            // Calculate respective price and quantity !
            if (request.body.type === "sell") {
                console.log("Order Type: Sell");
                // Calculate price for sell quantity
                calculatedEntity = calculatePrice(Number(request.body.sellerBase_price), Number(request.body.quantity));
            } else {
                console.log("Order Type: Buy");
                // Calculate quantity for buy price
                calculatedEntity = calculateQuantity(Number(request.body.price), Number(product.base_price));
                if (calculatedEntity < product.base_quantity && Number(request.body.buyerBase_price) == product.base_price) {
                    console.log("Buy Order Conditions Fulfilled");
                    // First order will be accepted !
                    buyOrder_success = true;
                }
            }




            // Now,place the order, Imposter one is first buy order, so seperate that out and store all other orders !
            // 200 error code represents sell order error
            // 300 error code represents buy order error 
            OrderBook.findOne({ name: request.body.name })
                .then((order) => {


                    if (order) {
                        let sellOrders_list = order.sellOrders;
                        let buyOrders_list = order.buyOrders;
                        // Order can be sell or buy !
                        if (request.body.type === "bid") {
                            //ORDER: BUY
                            // Check for empty sell order array
                            //OPERATION: 1. Sort all sell orders according to price time priorty
                            if (sellOrders_list.length === 0) {
                                // No sell order is stored so buy order will be stored directly in database !
                                let buyOrderObject = {
                                    id: Date.now(),
                                    type: "buy",
                                    email: request.session.email,
                                    name: product.name,
                                    base_price: Number(request.body.buyerBase_price),
                                    price: Number(request.body.price),
                                    quantity: calculatedEntity,
                                    date: new Date().toString()
                                }
                                // Update Buy orders in orderbook
                                OrderBook.updateOne({
                                    name: product.name
                                }, {
                                    $push: {
                                        buyOrders: buyOrderObject
                                    }
                                }, {
                                    $new: true
                                })
                                    .then(() => {
                                        console.log("Order Updated !");

                                        response.json({
                                            responseCode: 300,
                                            message: "No Sell Order exists...Buy Order Placed"
                                        })
                                    })
                                    .catch(err => console.log("Error: ", err));
                            } else {
                                let probable_sellOrder = pricetimepriorty(sellOrders_list);
                                console.log("PROBABLE SELL ORDER: ");
                                console.log(probable_sellOrder);

                                console.log("ASK PRICE: ");
                                console.log(probable_sellOrder.base_price);

                                console.log("BUYER PRICE: ");
                                console.log(request.body.buyerBase_price);

                                // Trade
                                let newValuesObj = createOrderBook_result(product.name, Number(probable_sellOrder.base_price), Number(probable_sellOrder.quantity), Number(request.body.buyerBase_price), Number(calculatedEntity), 0, 0);
                                console.log("Trade Result: ");
                                console.log(newValuesObj);

                                let updatedPrice, updatedQuantity = probable_sellOrder.quantity;
                                if (newValuesObj === -1) {
                                    let buyOrderObject = {
                                        id: Date.now(),
                                        type: "buy",
                                        email: request.session.email,
                                        name: product.name,
                                        base_price: Number(request.body.buyerBase_price),
                                        price: Number(request.body.price),
                                        quantity: calculatedEntity,
                                        date: new Date().toString()
                                    }
                                    // Update Buy orders in orderbook
                                    OrderBook.updateOne({
                                        name: product.name
                                    }, {
                                        $push: {
                                            buyOrders: buyOrderObject
                                        }
                                    }, {
                                        $new: true
                                    })
                                        .then(() => {
                                            console.log("Order Updated");

                                            response.json({
                                                message: "Trade didn't happen...Buy Order Placed"
                                            })
                                        })
                                        .catch(err => console.log("Error: ", err));
                                } else {
                                    // Handle perfect and partial orders !
                                    console.log("New Value Object Generated: ");
                                    console.log(newValuesObj);

                                    if (newValuesObj.order_code === 200) {
                                        // Perfect Order   
                                        // Delete respective buy and sell order from database 
                                        // How to change seller's portfolio ?
                                        OrderBook.updateOne({
                                            name: product.name
                                        }, {
                                            $pull: { sellOrders: { id: probable_sellOrder.id } }
                                        }, {
                                            $new: true
                                        })
                                            .then(() => {
                                                console.log("Seller's Email : ");
                                                console.log(probable_sellOrder.email);
                                                User.findOne({ email: probable_sellOrder.email })
                                                    .then((user) => {
                                                        let portfolio = user.portfolio;

                                                        let assetIndex = portfolio.findIndex((asset) => asset.name === product.name);

                                                        if (assetIndex < 0) {
                                                            // For debugging purposes
                                                        } else {
                                                            let total_quantity = portfolio[assetIndex].no_of_shares;
                                                            // Change seller's asset quantity in portfolio 
                                                            User.updateOne({
                                                                email: probable_sellOrder.email
                                                            }, {
                                                                $set: { portfolio: { name: product.name, price: product.base_price, no_of_shares: total_quantity + newValuesObj.quantity } }
                                                            }, {
                                                                $new: true
                                                            })
                                                                .then(() => {
                                                                    // Add buy order in buyer's portfolio !
                                                                    User.updateOne({
                                                                        email: request.session.email
                                                                    }, {
                                                                        $push: { portfolio: { name: product.name, price: Number(request.body.buyerBase_price), no_of_shares: Number(calculatedEntity) } }
                                                                    }, {
                                                                        $new: true
                                                                    })
                                                                        .then(() => {
                                                                            // Send mail to buyer
                                                                            subject = "Online Marketplace: Order Completed";
                                                                            order = "complete";
                                                                            body = `Hello ${request.session.user_name}, 
                                                                                    Your Order is Completed !
                                    
                                                                                    Product Name: ${product.productName}
                                                                                    Base Price: ${request.body.buyerBase_price}
                                                                                    Quantity: ${calculatedEntity}`;

                                                                            response.json({
                                                                                responseCode: 200,
                                                                                message: "Matched"
                                                                            })

                                                                            // buyerMail(request.session.email, subject, body, (err) => {
                                                                            //     if (err) {
                                                                            //         response.status(503).json({
                                                                            //             message: `Mail Error`,
                                                                            //             order: order
                                                                            //         })
                                                                            //     } else {
                                                                            //         response.json({
                                                                            //             message: "Matched"
                                                                            //         })
                                                                            //     }
                                                                            // });

                                                                        })
                                                                        .catch(err => console.log("Error: ", err));
                                                                })
                                                                .catch(err => console.log("Error: ", err));
                                                        }
                                                    })
                                                    .catch(err => console.log(err));



                                            })
                                            .catch(err => console.log("Error: ", err));

                                    } else {
                                        // Partial Order
                                        // Store that partial buy order in database with updated quantity
                                        console.log("PARTIAL ORDER SECTION: ");
                                        console.log("Values: ");
                                        console.log(newValuesObj);

                                        let partialOrderObject = {
                                            id: Date.now(),
                                            type: "buy",
                                            email: request.session.email,
                                            name: product.name,
                                            base_price: newValuesObj.price,
                                            price: newValuesObj.price * Number(newValuesObj.partialQuantity),
                                            quantity: newValuesObj.partialQuantity,
                                            date: new Date().toString()
                                        }

                                        // Update Buy orders in orderbook
                                        OrderBook.updateOne({
                                            name: product.name
                                        }, {
                                            $push: {
                                                buyOrders: partialOrderObject
                                            }
                                        }, {
                                            $new: true
                                        })
                                            .then(() => {
                                                console.log("Order Updated: PARTIAL ORDER");

                                                response.json({
                                                    message: "Order Updated: PARTIAL ORDER"
                                                })
                                            })
                                            .catch(err => console.log("Error: ", err));
                                    }
                                }


                            }

                        } else {
                            //ORDER: SELL
                            //Check for empty buy order array
                            //OPERATION: 1. Sort all buy orders according to price time priorty

                            // Base check for selling i.e check portfolio, whether asset exists or not in portfolio
                            User.findOne({ email: request.session.email })
                                .then((user) => {
                                    if (user.portfolio.length === 0) {
                                        console.log("Error: EMPTY PORTFOLIO");
                                        response.json({
                                            message: "You can't sell this asset !"
                                        })
                                    } else {
                                        let getIndex = user.portfolio.findIndex((asset) => asset.name === product.name);

                                        if (getIndex < 0) {
                                            response.json({
                                                message: "You can't sell this asset !"
                                            })
                                        } else {
                                            if (user.portfolio[getIndex].no_of_shares >= Number(request.body.quantity)) {
                                                if (buyOrders_list.length === 0) {
                                                    // No buy order is stored so buy order will be stored directly in database !
                                                    let sellOrderObject = {
                                                        id: Date.now(),
                                                        type: "sell",
                                                        email: request.session.email,
                                                        name: product.name,
                                                        base_price: Number(request.body.sellerBase_price),
                                                        price: calculatedEntity,
                                                        quantity: Number(request.body.quantity),
                                                        date: new Date().toString()
                                                    }
                                                    // Update Buy orders in orderbook
                                                    OrderBook.updateOne({
                                                        name: product.name
                                                    }, {
                                                        $push: {
                                                            sellOrders: sellOrderObject
                                                        }
                                                    }, {
                                                        $new: true
                                                    })
                                                        .then(() => {
                                                            let new_quantity = Number(user.portfolio[getIndex].no_of_shares) - Number(request.body.quantity);
                                                            // Update portfolio whenever we place any sell order !
                                                            User.updateOne({
                                                                email: request.session.email
                                                            }, {
                                                                $set: {
                                                                    portfolio: {
                                                                        name: product.name,
                                                                        price: (user.portfolio[getIndex].price * new_quantity) / user.portfolio[getIndex].no_of_shares,
                                                                        no_of_shares: new_quantity
                                                                    }
                                                                }
                                                            }, {
                                                                $new: true
                                                            })
                                                                .then(() => {
                                                                    console.log("Order Updated !");

                                                                    response.json({
                                                                        responseCode: 300,
                                                                        message: "No Buy Order exists...Sell Order Placed"
                                                                    })
                                                                })
                                                                .catch(err => console.log("Error: ", err));
                                                        })
                                                        .catch(err => console.log("Error: ", err));

                                                } else {
                                                    let probable_buyOrder = pricetimepriorty(buyOrders_list);
                                                    console.log("PROBABLE BUY ORDER: ");
                                                    console.log(probable_buyOrder);

                                                    console.log("ASK PRICE: ");
                                                    console.log(request.body.sellerBase_price);

                                                    console.log("BUYER PRICE: ");
                                                    console.log(probable_buyOrder.base_price);
                                                    // Trade
                                                    let newValuesObj = createOrderBook_result(product.name, Number(request.body.sellerBase_price), Number(request.body.quantity), Number(probable_buyOrder.base_price), Number(probable_buyOrder.quantity), 0, 0);
                                                    console.log("Trade Result: ");
                                                    console.log(newValuesObj);


                                                    // Invalid
                                                    if (newValuesObj === -1) {
                                                        let sellOrderObject = {
                                                            id: Date.now(),
                                                            type: "sell",
                                                            email: request.session.email,
                                                            name: product.name,
                                                            base_price: Number(request.body.sellerBase_price),
                                                            price: calculatedEntity,
                                                            quantity: Number(request.body.quantity),
                                                            date: new Date().toString()
                                                        }
                                                        // Update Buy orders in orderbook
                                                        OrderBook.updateOne({
                                                            name: product.name
                                                        }, {
                                                            $push: {
                                                                sellOrders: sellOrderObject
                                                            }
                                                        }, {
                                                            $new: true
                                                        })
                                                            .then(() => {
                                                                let new_quantity = Number(user.portfolio[getIndex].no_of_shares) - Number(request.body.quantity);
                                                                // Update portfolio whenever we place any sell order !
                                                                User.updateOne({
                                                                    email: request.session.email
                                                                }, {
                                                                    $set: {
                                                                        portfolio: {
                                                                            name: product.name,
                                                                            price: (user.portfolio[getIndex].price * new_quantity) / user.portfolio[getIndex].no_of_shares,
                                                                            no_of_shares: new_quantity
                                                                        }
                                                                    }
                                                                }, {
                                                                    $new: true
                                                                })
                                                                    .then(() => {
                                                                        console.log("Order Updated !");

                                                                        response.json({
                                                                            responseCode: 300,
                                                                            message: "Trade didn't happen...Sell Order Placed"
                                                                        })
                                                                    })
                                                                    .catch(err => console.log("Error: ", err));
                                                            })
                                                            .catch(err => console.log("Error: ", err));
                                                    } else {
                                                        // Perfect Order and Partial Order section
                                                        if (newValuesObj.order_code === 200) {
                                                            // Perfect Order
                                                            // Portfolio Change in seller's profile
                                                            // Update portfolio whenever we place any sell order !
                                                            let new_quantity = Number(user.portfolio[getIndex].no_of_shares) - Number(request.body.quantity);

                                                            OrderBook.updateOne({
                                                                name: product.name
                                                            }, {
                                                                $pull: { buyOrders: { id: probable_buyOrder.id } }
                                                            }, {
                                                                $new: true
                                                            })
                                                                .then(() => {
                                                                    User.updateOne({
                                                                        email: request.session.email
                                                                    }, {
                                                                        $set: {
                                                                            portfolio: {
                                                                                name: product.name,
                                                                                price: (user.portfolio[getIndex].price * new_quantity) / user.portfolio[getIndex].no_of_shares,
                                                                                no_of_shares: new_quantity + newValuesObj.quantity
                                                                            }
                                                                        }
                                                                    }, {
                                                                        $new: true
                                                                    })
                                                                        .then(() => {
                                                                            // Push buy order in buyer's portfolio !
                                                                            User.updateOne({
                                                                                email: probable_buyOrder.email
                                                                            }, {
                                                                                $push: { portfolio: { name: product.name, price: Number(probable_buyOrder.base_price), no_of_shares: Number(probable_buyOrder.quantity) } }
                                                                            }, {
                                                                                $new: true
                                                                            })
                                                                                .then(() => {
                                                                                    // Send mail to buyer
                                                                                    // subject = "Online Marketplace: Order Completed";
                                                                                    // order = "complete";
                                                                                    // body = `Hello ${request.session.user_name}, 
                                                                                    //         Your Order is Completed !

                                                                                    //         Product Name: ${product.productName}
                                                                                    //         Base Price: ${request.body.buyerBase_price}
                                                                                    //         Quantity: ${calculatedEntity}`;

                                                                                    response.json({
                                                                                        responseCode: 200,
                                                                                        message: "Matched"
                                                                                    })

                                                                                    // buyerMail(request.session.email, subject, body, (err) => {
                                                                                    //     if (err) {
                                                                                    //         response.status(503).json({
                                                                                    //             message: `Mail Error`,
                                                                                    //             order: order
                                                                                    //         })
                                                                                    //     } else {
                                                                                    //         response.json({
                                                                                    //             message: "Matched"
                                                                                    //         })
                                                                                    //     }
                                                                                    // });

                                                                                })
                                                                                .catch(err => console.log("Error: ", err));

                                                                        })
                                                                        .catch(err => console.log("Error: ", err));
                                                                })
                                                                .catch(err => console.log("Error: ", err));


                                                        } else {
                                                            // Partial Order
                                                            // Partial Order
                                                            // Store that partial buy order in database with updated quantity
                                                            console.log("PARTIAL ORDER SECTION: ");
                                                            console.log("Values: ");
                                                            console.log(newValuesObj);

                                                            let partialOrderObject = {
                                                                id: Date.now(),
                                                                type: "buy",
                                                                email: probable_buyOrder.email,
                                                                name: product.name,
                                                                base_price: newValuesObj.price,
                                                                price: newValuesObj.price * Number(newValuesObj.partialQuantity),
                                                                quantity: newValuesObj.partialQuantity,
                                                                date: new Date().toString()
                                                            }

                                                            // Update Buy orders in orderbook
                                                            OrderBook.updateOne({
                                                                name: product.name
                                                            }, {
                                                                $push: {
                                                                    buyOrders: partialOrderObject
                                                                }
                                                            }, {
                                                                $new: true
                                                            })
                                                                .then(() => {
                                                                    console.log("Order Updated: PARTIAL ORDER");

                                                                    response.json({
                                                                        message: "Order Updated: PARTIAL ORDER"
                                                                    })
                                                                })
                                                                .catch(err => console.log("Error: ", err));
                                                        }
                                                    }
                                                }
                                            } else {
                                                // This means your quantity of asset is zero, that means you have to remove this asset from your portfolio !
                                                User.updateOne({
                                                    email: request.session.email
                                                }, {
                                                    $pull: { portfolio: { name: product.name } }
                                                }, {
                                                    $new: true
                                                })
                                                    .then(() => {
                                                        console.log("Asset is removed !");
                                                        response.json({
                                                            message: "You can't sell this asset !"
                                                        })

                                                    })
                                                    .catch(err => console.log("Error: ", err));
                                            }
                                        }
                                    }
                                })
                                .catch(err => console.log("Error: ", err));

                        }

                    } else {
                        console.log("Empty Document");
                        console.log("Buy Order Flag: ");
                        console.log(buyOrder_success);
                        // This section is for FIRST ORDER !
                        // Now check for whether it is buy or sell 
                        if (buyOrder_success) {
                            console.log("First Buy Order");
                            // This is buy order and directly store it into portfolio !
                            User.updateOne({
                                email: request.session.email
                            }, {
                                $push: {
                                    portfolio: {
                                        name: product.name,
                                        price: Number(request.body.price),
                                        no_of_shares: calculatedEntity
                                    }
                                }
                            }, {
                                $new: true
                            })
                                .then(() => {
                                    console.log("Portfolio Updated !");

                                    // Create empty order document !
                                    let orderObject = {
                                        name: product.name,
                                        sellOrders: [{
                                            id: Date.now(),
                                            type: "sell",
                                            email: "admin@onlinemarket",
                                            name: product.name,
                                            base_price: product.base_price,
                                            price: Number(product.base_price) * Number(product.base_quantity),
                                            quantity: product.base_quantity,
                                            date: new Date().toString()
                                        }],
                                        buyOrders: []
                                    }

                                    new OrderBook(orderObject).save()
                                        .then(() => {
                                            response.json({
                                                responseCode: 400,
                                                message: "Success"
                                            })
                                        })
                                        .catch(err => console.log("Error: ", err));
                                })
                                .catch(err => console.log("Error: ", err));

                        } else {
                            // This is sell order, prompt an error to user !
                            response.json({
                                responseCode: 404,
                                message: "Placing Error"
                            })
                        }
                    }
                })
                .catch(err => console.log("Error: ", err));
        })
        .catch(err => console.log("Error: ", err));




})

app.get("/orders", unauthenticated, (request, response) => {
    let { name } = request.query;
    let { email } = request.session;

    let orders = [];

    OrderBook.findOne({ name: name })
        .then((asset) => {

            if (asset) {
                // Sell orders !
                asset.sellOrders.forEach(order => {
                    if (order.email === email) {
                        orders.push(order);
                    }
                });


                //  Buy Orders
                asset.buyOrders.forEach(order => {
                    if (order.email === email) {
                        orders.push(order);
                    }
                });

                console.log("ORDERS: ");
                console.log(orders);


                response.render("orderHistory", { orders });
            }else{
                response.send("No Order History exists !");
            }

        })
        .catch(err => console.log("Error: ", err));
})

// type - POST
// route - /process
// Desc - trade
app.post("/process", (request, response) => {

    if (request.session.email != undefined) {
        console.log(request.body);

        // Declare variables for each product parameter !

        let productID = request.body.id;
        let bidPrice = request.body.price;
        let bidQuantity = request.body.quantity;

        console.log("Product ID:", productID);
        console.log("Price: ", bidPrice);
        console.log("Quantity: ", bidQuantity);

        Product.findOne({ _id: productID })
            .then((product) => {
                console.log("Seller's Product: ");
                console.log(product);

                console.log("Partial Array: ");
                console.log(partialData);

                if (product.productQuantity === 0) {
                    response.status(503).json({
                        message: "Zero quantity error",
                        order: "invalid",
                        responseCode: 503
                    })
                } else {
                    let partialPrice = 0;
                    let partialQuantity = 0;

                    // Delete partial order if exists !
                    if (partialData.length != 0) {
                        partialPrice = partialData[0].price;
                        partialQuantity = partialData[0].quantity;

                        let body = `Congratulations, Your pending order is about to get completed !
                                    Order Details: 
                                    Order Name: ${productName}
                                    Order Price: ${partialData[0].price}
                                    Order Quantity: ${partialData[0].quantity}`

                        // Send Mail to partial User!
                        partialMail(partialData[0].email, body, (err) => {
                            if (err) {
                                console.log("Mail error");
                                //                                 response.status(503).json({
                                //                                     message : `Mail Error`,
                                //                                     order : "complete"
                                //                                     responseCode : 503
                                //                                 })
                            } else {
                                console.log("Your Partial order is about to get completed !");
                                //                                 response.status(200).json({
                                //                                     message : `Mail sent....Partial Order Completed !`,
                                //                                     order : "complete",
                                //                                     responseCode : 200
                                //                                 })
                            }
                        });
                        // Delete Partial Data array !
                        partialData.splice(0, 1);
                    }

                    console.log("Partial Price: ", partialPrice);
                    console.log("Partial Quantity: ", partialQuantity);

                    let newValuesObj = createOrderBook_result(product.productName, Number(product.productPrice), Number(product.productQuantity), Number(bidPrice), Number(bidQuantity), Number(partialPrice), Number(partialQuantity));

                    let updatedPrice, updatedQuantity = product.productQuantity;
                    if (newValuesObj === -1) {
                        response.status(503).json({
                            message: "Order is invalid...try later !",
                            order: "invalid",
                            responseCode: 503
                        })
                    } else {  //When order matches or partially matches !
                        console.log("New Value Object Generated: ");
                        console.log(newValuesObj);

                        // Update Ask price if needed !
                        if (product.productPrice != newValuesObj.price) {
                            updatedPrice = newValuesObj.price; //Updated values of price !
                        }

                        // Update quantity 
                        // console.log("Ask Quantity: ", product.quantity);
                        console.log("New Object Quantity: ", newValuesObj.quantity);
                        if (product.productQuantity != newValuesObj.quantity) {

                            console.log("Ready for partial Data !");
                            //Update quantity, insert partially matched item in partialData array !
                            updatedQuantity = newValuesObj.quantity; //Updated values of quantity !

                            if (newValuesObj.order_status === "Order is Partially Completed") {
                                // Partial Data !
                                let partialItemObject = {
                                    sellerName: product.seller_name,
                                    email: request.session.email,
                                    name: newValuesObj.name,
                                    price: newValuesObj.partialPrice,
                                    quantity: newValuesObj.partialQuantity
                                }

                                partialData.push(partialItemObject);
                            }


                        }

                        // Send a notification to seller and simultaneously update product database !
                        Seller.updateOne(
                            {
                                email: product.email
                            },
                            { $set: { "products.$[elem].productPrice": updatedPrice, "products.$[elem].productQuantity": updatedQuantity } },
                            { arrayFilters: [{ "elem.productName": { $gte: product.productName } }] })
                            .then(() => {

                                // Update Product Database !
                                Product.updateOne(
                                    {
                                        productName: product.productName
                                    },
                                    {
                                        $set: { productPrice: updatedPrice, productQuantity: updatedQuantity }
                                    },
                                    {
                                        $new: true
                                    }
                                )
                                    .then(() => {
                                        let subject = "";
                                        let body = "";
                                        let order = "";
                                        if (newValuesObj.order_code === 200) {

                                            subject = "Online Marketplace: Order Completed";
                                            order = "complete";
                                            body = `Hello ${request.session.user_name}, 
                                                Your Order is Completed !

                                                Product Name: ${product.productName}
                                                Product Price: ${bidPrice}
                                                Product Quantity: ${bidQuantity}`;

                                        } else if (newValuesObj.order_code === 201) {

                                            subject = "Online Marketplace: Order Partially Completed";
                                            order = "partial";
                                            body = `Hello ${request.session.user_name}, 
                                                Your Order is Partially Completed !
            
                                                Product Name: ${product.productName}
                                                Product Price: ${bidPrice}
                                                Product Quantity: ${bidQuantity}
                                                
                                                Wait till your order gets completed, your pending order is
                                                Product Name: ${productName}
                                                Product Price: ${newValuesObj.partialPrice}
                                                Product Quantity: ${newValuesObj.partialQuantity}
                                                `;

                                        }
                                        // Send order notification to buyer !
                                        buyerMail(request.session.email, subject, body, (err) => {
                                            if (err) {
                                                response.status(503).json({
                                                    message: `Mail Error`,
                                                    order: order
                                                })
                                            } else {
                                                response.status(200).json({
                                                    message: `Mail sent ! ${subject}`,
                                                    order: order
                                                })
                                            }
                                        });
                                    })
                                    .catch(err => console.log("Error: ", err));
                            })
                            .catch(err => console.log("Error: ", err));
                    }
                }


            })
            .catch(err => console.log("Error: ", err));


    } else {
        response.status(200).redirect("/login");
    }
})

app.get("/admin", unauthenticated, (request, response) => {
    if (request.session.adminAccess) {
        response.render("admin");
    } else {
        response.redirect("/dashboard");
    }
});

app.get("/logout", unauthenticated, (request, response) => {
    request.session.destroy(function (err) {
        // cannot access session here
        response.redirect("/")
    });
})

// Listening to port and host (Basically kicks on the server)
app.listen(port, host, () => {
    console.log(`Server is running at ${port}`);
})
