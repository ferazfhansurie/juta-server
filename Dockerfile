FROM node:slim

RUN apt-get update && apt-get install -y \
    ffmpeg \
    nano \
    zip unzip \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    chromium \
    wget \
    gnupg \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*
    
# Install Chrome
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list
RUN apt-get update && apt-get install -y google-chrome-stable

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production \
    && npm cache clean --force

COPY . .
# RUN cp /app/.env.example /app/.env

EXPOSE 3000

CMD ["npm", "start"]