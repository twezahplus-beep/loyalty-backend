# Use Node.js 20 slim (Debian-based) for prebuilt native module binaries
FROM node:20-slim

# Set working directory
WORKDIR /app

# Install system dependencies required for native modules (canvas, sharp, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    libcairo2-dev \
    libjpeg62-turbo-dev \
    libpango1.0-dev \
    libgif-dev \
    libpixman-1-dev \
    librsvg2-dev \
    pkg-config \
    fontconfig \
    fonts-dejavu-core \
    fonts-liberation \
    fonts-noto \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy source code
COPY . .

# Create uploads directory
RUN mkdir -p uploads/qr-codes uploads/receipts

# Expose port
EXPOSE 5000

# Start the application
CMD ["npm", "start"]
