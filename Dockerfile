FROM node:16
RUN apt-get update || : && apt-get install python3-pip -y
RUN mkdir -m 700 ~/.ssh; touch -m 600 ~/.ssh/known_hosts; ssh-keyscan bitbucket.org > ~/.ssh/known_hosts
WORKDIR /usr/src/app
COPY ./package*.json ./
RUN --mount=type=ssh npm ci
RUN --mount=type=ssh npm audit fix
COPY ./src ./src
COPY ./dist ./dist
COPY ./types ./types
COPY ./tsconfig.json .
EXPOSE 8080
CMD [ "npm", "start" ]
