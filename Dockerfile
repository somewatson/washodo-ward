FROM node:20-bullseye

# Install build tools for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-setuptools \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# Clean install to ensure no cached binaries from different node versions are used
RUN npm ci || npm install

COPY . .
RUN npm run build

CMD ["npm", "start"]
