# base docker image to build backend server off
FROM node:24-alpine

# set working directory inside container to /app
WORKDIR /app

# copy the dependencies to the working directory /app
COPY package*.json dest ./

RUN npm install

# copy backend files to ./app folder
COPY . .

RUN npx prisma generate
RUN npx tsc

EXPOSE 8000

CMD ["node", "dist/index.js"]