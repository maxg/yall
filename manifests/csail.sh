#!/bin/bash

#
# CSAIL VM setup script.
#

# Install prerequisites
sudo apt-get update
sudo apt-get install git puppet-common

# Check out app
sudo mkdir /vagrant
sudo chown `whoami` /vagrant
git clone https://github.com/maxg/yall.git /vagrant

# Provision VM
sudo puppet apply /vagrant/manifests/default.pp

# Go to app
cd /vagrant

# Install Node packages
npm install
