# Harbor SDK React Native Reference

This project was created with React Native 0.68.2.
### Requirements

1. Physical IOS device with bluetooth capabilities.
2. Make sure you have the following development environment in your machine: https://reactnative.dev/docs/0.68/environment-setup

### Setup

1. Clone the repository.
2. Go to the project's `root/` and install the dependencies.
```
yarn install
```
3. Go to the `/ios` directory and install the pods
```
cd ios/
pod install
cd ..
```
4. Fill in your `credentials` and `tower id` to the environment constants located @ `/App.js`.
```
const USER_NAME = 'yourAccount@email.here'; // fill with your username
const USER_PWD = 'yourPassword'; // fill with your password
const SDK_ENV = 'targetEnvironment'; // fill with your target sdk environment
const MY_TOWER_ID = 'yourTowerId'; // fill with your tower id
```
5. Now you can build the code to your phone.

