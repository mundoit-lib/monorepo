export const laravel = {
  request: function (req: any, token: string) {
    // @ts-ignore
    this.drivers.http.setHeaders.call(this, req, {
      Authorization: 'Bearer ' + token,
    });
  },

  response: function (res: any) {
    /**
     * TODO: Further investigation about the tokens must be implemented
     * Laravel responses expires_in in seconds. Because it is useless
     * unless you keep the timestamp of tokens response, we convert it into
     * expire date by converting to miliseconds first then adding to now timestamp
     */

    const accessToken = res.data.access_token;
    const refreshToken = res.data.refresh_token;
    const tokenExpireDate = res.data.expires_in + res.data.expires_in * 1000 + Date.now();
    /**
     * TODO: Again, do more checks for the tokens!
     */

    if (accessToken) {
      // @TODO: Sacar esto de acá
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('tokenExpireDate', tokenExpireDate);
      return accessToken;
    }
  },
};

export default laravel;
