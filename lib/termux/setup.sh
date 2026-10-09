#!/usr/bin/env bash
set -e

echo "Setting up Ubuntu environment..."
apt update && apt upgrade -y

echo "Installing required packages..."
apt install -y git ffmpeg build-essential libvips-dev webp curl ca-certificates

echo "Installing Node.js (LTS)..."
curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
apt install -y nodejs

echo "Installing Yarn package manager..."
npm install -g yarn

echo "Cloning EpziZ repository..."
if [ -d "EpziZ/.git" ]; then
  echo "EpziZ is already cloned. Skipping clone."
else
  git clone https://github.com/Epziii/EpziZ.git
fi

cd EpziZ

if [ ! -f config.env ]; then
  if [ -f .env.example ]; then
    cp .env.example config.env
  else
    echo "Error: .env.example was not found."
    exit 1
  fi
fi

nano config.env

yarn install
yarn start