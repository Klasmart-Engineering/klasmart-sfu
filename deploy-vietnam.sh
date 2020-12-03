#!/usr/bin/env bash
aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin 494634321140.dkr.ecr.ap-northeast-2.amazonaws.com
docker build -t vietnam-sfu .
docker tag vietnam-sfu:latest 494634321140.dkr.ecr.ap-northeast-2.amazonaws.com/vietnam-sfu:latest
docker push 494634321140.dkr.ecr.ap-northeast-2.amazonaws.com/vietnam-sfu:latest