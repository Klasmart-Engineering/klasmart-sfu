FROM node:14
WORKDIR /usr/src/app
RUN npm i mediasoup
COPY ./package*.json ./
RUN npm i
COPY ./src ./src
COPY ./tsconfig.json .
EXPOSE 8080
CMD [ "npm", "start" ]