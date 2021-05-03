FROM node:14
WORKDIR /usr/src/app
COPY ./package*.json ./
RUN npm cache verify
RUN npm i
RUN npm audit fix
COPY ./src ./src
COPY ./tsconfig.json .
EXPOSE 8080
CMD [ "npm", "start" ]