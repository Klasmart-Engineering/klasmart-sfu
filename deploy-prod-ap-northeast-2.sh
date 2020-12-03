#!/usr/bin/env bash
aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin 494634321140.dkr.ecr.ap-northeast-2.amazonaws.com
docker build -t prod-sfu .
docker tag prod-sfu:latest 494634321140.dkr.ecr.ap-northeast-2.amazonaws.com/prod-sfu:latest
docker push 494634321140.dkr.ecr.ap-northeast-2.amazonaws.com/prod-sfu:latest
aws ecs update-service --region ap-northeast-2 --cluster prod-hub --service arn:aws:ecs:ap-northeast-2:494634321140:service/prod-hub/prod-sfu-service --force-new-deployment
