#!/usr/bin/env bash
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 494634321140.dkr.ecr.ap-south-1.amazonaws.com
docker build -t prod-sfu .
docker tag prod-sfu:latest 494634321140.dkr.ecr.ap-south-1.amazonaws.com/prod-sfu:latest
docker push 494634321140.dkr.ecr.ap-south-1.amazonaws.com/prod-sfu:latest
# aws ecs update-service --service arn:aws:ecs:ap-south-1:494634321140:service/prod-hub/prod-sfu-service --force-new-deployment --cluster prod-hub --region ap-south-1