'use server';

export async function getSimliToken() {
  const SIMLI_API_KEY = process.env.SIMLI_API_KEY;
  
  if (!SIMLI_API_KEY) {
    // In a real app, this would be an error, but for boilerplate we can log it.
    console.warn("SIMLI_API_KEY is missing from environment variables.");
    // Return a mock or handle gracefully
    return null;
  }

  try {
    const response = await fetch('https://api.simli.ai/getToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiKey: SIMLI_API_KEY,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to fetch Simli token');
    }

    const data = await response.json();
    return data.session_token;
  } catch (error) {
    console.error('Error getting Simli token:', error);
    return null;
  }
}

export async function getSimliFaceId() {
  const SIMLI_FACE_ID = process.env.SIMLI_FACE_ID;

  if (!SIMLI_FACE_ID) {
    console.warn("SIMLI_FACE_ID is missing from environment variables.");
    return null;
  }

  return SIMLI_FACE_ID;
}

export async function getIceServers() {
  const SIMLI_API_KEY = process.env.SIMLI_API_KEY;

  if (!SIMLI_API_KEY) {
    console.warn("SIMLI_API_KEY is missing from environment variables.");
    return null;
  }

  try {
    const response = await fetch('https://api.simli.ai/getIceServers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiKey: SIMLI_API_KEY,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to fetch ICE servers');
    }

    const data = await response.json();
    return data.ice_servers;
  } catch (error) {
    console.error('Error getting Simli ICE servers:', error);
    return null;
  }
}
