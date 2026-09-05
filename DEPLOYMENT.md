# Deployment Guide - Label Flow

This guide will help you deploy the Label Flow to Railway for production use.

## Prerequisites

- GitHub account
- Railway account (sign up at [railway.app](https://railway.app))
- MongoDB Atlas account (for production database)
- Email service (Gmail recommended)

## Alternative: Split Deployment (Vercel Frontend + Railway Backend)

The steps below (3-4) deploy both frontend and backend to Railway. If instead you
want the frontend on **Vercel** and the backend on **Railway** (two separate
services), do this:

### Backend → Railway

1. Create a new Railway project from the GitHub repo. Leave the **root
   directory as the repo root** — `railway.toml` already points Railway at
   `node server/index.js` and builds via `npm install && npm run build`.
2. Set these environment variables in the Railway service (see `.env.example`
   for the full list):
   ```env
   MONGODB_URI=...
   JWT_SECRET=...
   JWT_EXPIRE=7d
   ENCRYPTION_KEY=...            # optional but recommended — see .env.example
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=...
   EMAIL_PASS=...
   NODE_ENV=production
   CLIENT_URL=https://<your-vercel-app>.vercel.app   # set AFTER the Vercel deploy exists
   SHIPPERSHUB_EMAIL=...          # optional fallback
   SHIPPERSHUB_PASSWORD=...       # optional fallback
   SHIPLABEL_API_KEY=...          # optional fallback
   LABELCROW_API_KEY=...          # optional fallback
   OPEN_EXCHANGE_RATES_APP_ID=... # optional
   ```
   `PORT` does not need to be set — Railway injects it automatically and
   `server/index.js` reads `process.env.PORT`.
3. Deploy and note the generated Railway domain — you'll need it for the
   frontend's `REACT_APP_API_URL`.

### Frontend → Vercel

1. Import the same GitHub repo into Vercel as a new project.
2. Set **Root Directory** to `client` in the Vercel project settings. A
   `client/vercel.json` is already checked in with the build command, output
   directory, and a SPA rewrite (so client-side routes like `/dashboard`
   don't 404 on refresh).
3. Add this environment variable in Vercel (Project Settings → Environment
   Variables):
   ```env
   REACT_APP_API_URL=https://<your-railway-app>.up.railway.app/api
   ```
   Note the required `/api` suffix — the client code appends routes like
   `/auth/login` directly to this base.
4. Deploy. Note the generated Vercel domain.
5. Go back to the Railway backend and set `CLIENT_URL` to that Vercel domain
   (this drives both CORS `allowedOrigins` and the Socket.IO CORS config in
   `server/index.js`), then redeploy the backend so the new value takes
   effect.

Order matters: deploy the backend first (to get its URL for
`REACT_APP_API_URL`), then the frontend, then circle back and set
`CLIENT_URL` on the backend once the frontend URL is known.

## Step 1: Prepare Your Repository

1. **Initialize Git** (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. **Create GitHub Repository**:
   - Go to GitHub and create a new repository
   - Push your code:
   ```bash
   git remote add origin https://github.com/yourusername/usps-label-portal.git
   git branch -M main
   git push -u origin main
   ```

## Step 2: Set Up MongoDB Atlas

1. **Create MongoDB Atlas Account**:
   - Go to [MongoDB Atlas](https://www.mongodb.com/atlas)
   - Create a free account
   - Create a new cluster

2. **Configure Database**:
   - Create a database user with read/write permissions
   - Whitelist your IP address (or use 0.0.0.0/0 for all IPs)
   - Get your connection string

## Step 3: Deploy to Railway

1. **Connect to Railway**:
   - Go to [Railway](https://railway.app)
   - Sign in with GitHub
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository

2. **Configure Environment Variables**:
   In Railway dashboard, go to Variables tab and add:

   ```env
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/usps-label-portal
   JWT_SECRET=your-super-secret-jwt-key-here-make-it-long-and-random
   JWT_EXPIRE=7d
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-gmail-app-password
   PORT=5000
   NODE_ENV=production
   CLIENT_URL=https://your-frontend-url.railway.app
   ```

3. **Deploy Backend**:
   - Railway will automatically detect your Node.js app
   - It will install dependencies and start the server
   - Note the generated URL for your backend

## Step 4: Deploy Frontend

1. **Create New Service for Frontend**:
   - In Railway, create a new service
   - Connect to the same GitHub repository
   - Set the root directory to `client`

2. **Configure Frontend Environment**:
   Add these variables to your frontend service:
   ```env
   REACT_APP_API_URL=https://your-backend-url.railway.app/api
   ```

3. **Build Configuration**:
   Railway will automatically detect React and run `npm run build`

## Step 5: Configure Email (Gmail)

1. **Enable 2-Factor Authentication** on your Gmail account
2. **Generate App Password**:
   - Go to Google Account settings
   - Security → 2-Step Verification → App passwords
   - Generate a new app password for "Mail"
   - Use this password in your `EMAIL_PASS` variable

## Step 6: Set Up Custom Domain (Optional)

1. **Add Custom Domain**:
   - In Railway dashboard, go to Settings
   - Add your custom domain
   - Update DNS records as instructed

2. **Update Environment Variables**:
   - Update `CLIENT_URL` with your custom domain

## Step 7: Test Your Deployment

1. **Test Backend**:
   - Visit `https://your-backend-url.railway.app/api/health`
   - Should return: `{"status":"OK","timestamp":"..."}`

2. **Test Frontend**:
   - Visit your frontend URL
   - Try registering a new user
   - Test file upload functionality

## Step 8: Create Admin User

Since there's no admin user by default, you'll need to create one:

1. **Register a regular user** through the frontend
2. **Connect to your MongoDB database**
3. **Update the user's role** to 'admin':
   ```javascript
   db.users.updateOne(
     { email: "admin@example.com" },
     { $set: { role: "admin" } }
   )
   ```

## Monitoring and Maintenance

### Logs
- View logs in Railway dashboard
- Monitor for errors and performance issues

### Database
- Monitor MongoDB Atlas dashboard
- Set up alerts for storage and performance

### Email
- Test email functionality regularly
- Monitor email delivery rates

## Troubleshooting

### Common Issues

1. **CORS Errors**:
   - Ensure `CLIENT_URL` is set correctly
   - Check that frontend URL matches exactly

2. **Database Connection Issues**:
   - Verify MongoDB connection string
   - Check IP whitelist in MongoDB Atlas

3. **Email Not Sending**:
   - Verify Gmail app password
   - Check email service configuration

4. **File Upload Issues**:
   - Check file size limits
   - Verify GridFS configuration

### Getting Help

- Check Railway logs for detailed error messages
- Review MongoDB Atlas logs
- Test API endpoints with Postman or curl

## Security Considerations

1. **Environment Variables**:
   - Never commit `.env` files
   - Use strong, unique passwords
   - Rotate secrets regularly

2. **Database Security**:
   - Use strong database passwords
   - Enable IP whitelisting
   - Regular security updates

3. **Application Security**:
   - Keep dependencies updated
   - Monitor for security vulnerabilities
   - Use HTTPS in production

## Scaling

As your application grows:

1. **Database Scaling**:
   - Upgrade MongoDB Atlas plan
   - Consider read replicas

2. **Application Scaling**:
   - Railway automatically handles scaling
   - Monitor resource usage

3. **File Storage**:
   - Consider AWS S3 for large files
   - Implement file cleanup policies

---

**Your Label Flow is now live! 🎉**

For support, check the logs and documentation, or create an issue in the GitHub repository.
