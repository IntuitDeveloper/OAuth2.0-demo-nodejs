require('dotenv').config();

var express = require('express');
var session = require('express-session');
var request = require('request');
var app = express();
var path = require('path');
var QuickBooks = require('node-quickbooks');
var queryString = require('query-string');
var Tokens = require('csrf');
var csrf = new Tokens();
var config = require('./config.json');

// Configure View and Handlebars
app.use(express.static(path.join(__dirname, '')))
app.set('views', path.join(__dirname, 'views'))
var exphbs = require('express-handlebars');
var hbs = exphbs.create({});
app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');
app.use(session({secret: 'secret', resave: 'false', saveUninitialized: 'false'}))

/*
Create body parsers for application/json and application/x-www-form-urlencoded
 */
var bodyParser = require('body-parser')
app.use(bodyParser.json())
var urlencodedParser = bodyParser.urlencoded({ extended: false })

/*
App Variables
 */
var token_json,realmId,accessToken;



app.use(express.static('views'));

app.get('/', function(req, res) {

    // Render home page with params
    res.render('index', {
        redirect_uri: config.redirectUri,
        token_json: token_json
    });
});

app.get('/authUri', function(req,res) {

    /*
    Generate csrf Anti Forgery
     */
    req.session.secret = csrf.secretSync();
    var state = csrf.create(req.session.secret);

    /*
    Generate the AuthUrl
     */
    var redirecturl = config.authorization_endpoint +
        '?client_id=' + config.clientId +
        '&redirect_uri=' + encodeURIComponent(config.redirectUri) +  //Make sure this path matches entry in application dashboard
        '&scope='+ config.scopes.connect_to_quickbooks[0] +
        '&response_type=code' +
        '&state=' + state;

    res.send(redirecturl);

});

app.get('/callback', function(req, res) {

    var parsedUri = queryString.parse(req.originalUrl);
    realmId = parsedUri.realmId;

    var auth = (new Buffer(config.clientId + ':' + config.clientSecret).toString('base64'));
    var postBody = {
        url: config.token_endpoint,
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: 'Basic ' + auth,
        },
        form: {
            grant_type: 'authorization_code',
            code: req.query.code,
            redirect_uri: config.redirectUri
        }
    };

    request.post(postBody, function (err, res, data) {
        accessToken = JSON.parse(res.body);
        token_json = JSON.stringify(accessToken, null,2);
    });
    res.send('');

});

app.get('/refreshAccessToken', function(req,res){

    var auth = (new Buffer(config.clientId + ':' + config.clientSecret).toString('base64'));
    var postBody = {
        url: config.token_endpoint,
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + auth,
        },
        form: {
            grant_type: 'refresh_token',
            refresh_token: accessToken.refresh_token
        }
    };

    request.post(postBody, function (err, res, data) {
        var accessToken = JSON.parse(res.body);
        token_json = JSON.stringify(accessToken, null,2);
        console.log('The Refreshed token is :'+ token_json);
    });
    res.send(accessToken);

});

app.get('/getCompanyInfo', function(req,res){

    // save the access token somewhere on behalf of the logged in user
    var qbo = new QuickBooks(config.clientId,
        config.clientSecret,
        accessToken.access_token, /* oAuth access token */
        false, /* no token secret for oAuth 2.0 */
        realmId,
        config.useSandbox, /* use a sandbox account */
        true, /* turn debugging on */
        34, /* minor version */
        '2.0', /* oauth version */
        accessToken.refresh_token /* refresh token */);

    qbo.getCompanyInfo(realmId, function(err, companyInfo) {
        if (err) {
            console.log(err);
            res.send(err);
        }
        else {
            console.log("The response is :" + JSON.stringify(companyInfo,null,2));
            res.send(companyInfo);
        }
    });
});


// Start server on HTTP (will use ngrok for HTTPS forwarding)
app.listen(8000, function () {
    console.log('Example app listening on port 3000!')
})
