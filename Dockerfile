FROM node:14
WORKDIR /usr/src/app
COPY ./package*.json ./
COPY ./src ./src
COPY ./tsconfig.json .
EXPOSE 8080
CMD [ "npm", "start" ]