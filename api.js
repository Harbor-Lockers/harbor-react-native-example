import axios from 'axios';
import Config from './credentials';
const loginURL = () => {
  switch (Config.SDK_ENV) {
    case 'production':
      return '.';
    case 'sandbox':
      return '.sandbox.';
    case 'development':
      return '.dev.';
  }
};
const BASE_URL = `https://api${loginURL()}harborlockers.com/api/v1/`;
const BASE_LOGIN = `https://accounts${loginURL()}harborlockers.com/realms/harbor/protocol/openid-connect/token`;
// In production private credentials should be handled on the back-end, this is only an example.

// get user api token for further requests
export const retrieveCredentials = async (name, secret) => {
  try {
    const requestOptions = {
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    };
    const encodedBody = {
      grant_type: 'client_credentials',
      scope: 'service_provider tower_access',
      client_id: name,
      client_secret: secret,
    };
    const response = await axios.post(BASE_LOGIN, encodedBody, requestOptions);
    const sdkTokenResponse = await authorizeCredentials(
      response.data.access_token,
    );
    return {
      api_access_token: response.data.access_token,
      token_type: response.data.token_type,
      sdk_token: sdkTokenResponse.access_token,
    };
  } catch (error) {
    console.log('retrive credentials failed')
    throw error;
  }
};
// authorize user for sdk usage, gets harbor sdk token
async function authorizeCredentials(bearerToken) {
  try {
    const authorizeEndpoint = `${BASE_URL}login/authorize`;
    const requestOptionsAuth = {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${bearerToken}`,
      },
    };
    const reqBody = {userId: 'My test Run'};
    const response = await axios.post(
      authorizeEndpoint,
      reqBody,
      requestOptionsAuth,
    );
    return response.data;
  } catch (error) {
    throw error;
  }
}

// get list of data about the lockers in the tower
export async function getLockersInTower(towerId, bearerToken) {
  try {
    const getLockerDataEndpoint = `${BASE_URL}towers/${towerId.toLowerCase()}/lockers`;
    const requestOptionsAuth = {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${bearerToken}`,
      },
    };
    const response = await axios.get(getLockerDataEndpoint, requestOptionsAuth);
    const availableLockersForDropOff = response.data.filter(
      locker => locker.status?.name === 'available',
    );
    return availableLockersForDropOff;
  } catch (error) {
    throw error;
  }
}

// requests encrypted tokens to open target locker
export async function createDropOffToken(towerId, lockerId, bearerToken) {
  try {
    const createDropOffEndpoint = `${BASE_URL}towers/${towerId}/lockers/${lockerId}/dropoff-locker-tokens`;
    const requestOptionsAuth = {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${bearerToken}`,
      },
    };
    const requestBody = {client_info: 'demo open locker', duration: 3000};
    const response = await axios.post(
      createDropOffEndpoint,
      requestBody,
      requestOptionsAuth,
    );
    return {
      payload_auth: response.data.payload_auth,
      payload: response.data.payload,
    };
  } catch (error) {
    throw error;
  }
}
