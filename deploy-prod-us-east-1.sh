#!/usr/bin/env bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 494634321140.dkr.ecr.us-east-1.amazonaws.com
docker build -t prod-sfu .
docker tag prod-sfu:latest 494634321140.dkr.ecr.us-east-1.amazonaws.com/prod-sfu:latest
docker push 494634321140.dkr.ecr.us-east-1.amazonaws.com/prod-sfu:latest
aws ecs update-service --region us-east-1 --cluster prod-hub --service arn:aws:ecs:us-east-1:494634321140:service/prod-hub/prod-sfu-service --force-new-deployment
