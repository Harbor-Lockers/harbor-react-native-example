import axios from 'axios';

const BASE_URL = 'https://api.sandbox.harborlockers.com/api/v1/';

// networking

// get user api token for further requests
export async function retrieveCredentials(loginRequestBody) {
  try {
    const requestOptions = {
      headers: {
        'Content-type': 'multipart/form-data',
        Accept: 'multipart/form-data',
      },
    };
    const encodedBody = new FormData();
    encodedBody.append('username', loginRequestBody.username);
    encodedBody.append('password', loginRequestBody.password);
    encodedBody.append('grant_type', loginRequestBody.grant_type);
    const loginResponse = await axios.post(
      `${BASE_URL}login/access-token`,
      encodedBody,
      requestOptions,
    );
    const sdkTokenResponse = await authorizeCredentials(
      loginResponse.data.access_token,
    );
    return {
      api_access_token: loginResponse.data.access_token,
      token_type: loginResponse.data.token_type,
      sdk_token: sdkTokenResponse.access_token,
    };
  } catch (error) {
    throw error;
  }
}

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
