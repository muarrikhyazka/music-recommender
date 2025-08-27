// Minimal API service for build compatibility
class ApiService {
  async get(endpoint: string): Promise<any> {
    return fetch(`/api${endpoint}`).then(res => res.json());
  }
  
  async post(endpoint: string, data?: any): Promise<any> {
    return fetch(`/api${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined
    }).then(res => res.json());
  }
  
  async put(endpoint: string, data?: any): Promise<any> {
    return fetch(`/api${endpoint}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined
    }).then(res => res.json());
  }
  
  async delete(endpoint: string): Promise<any> {
    return fetch(`/api${endpoint}`, {
      method: 'DELETE'
    }).then(res => res.json());
  }
}

export const apiService = new ApiService();
export default apiService;