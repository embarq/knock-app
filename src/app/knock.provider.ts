import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap, catchError, switchMapTo, switchMap } from 'rxjs/operators';
import { InAppBrowser } from '@ionic-native/in-app-browser';

import * as io from 'socket.io-client';
import { Observable } from 'rxjs';
import { Platform } from 'ionic-angular';

interface SignInSuccessResponse {
  access_token: string;
  ok: boolean;
  scope: string;
  team_id: string;
  team_name: string;
  user_id: string;
}

interface SignInFailureResponse {
  ok: boolean;
  error: string;
}

interface UserProfileResponse {
  image_512: string;
  real_name_normalized: string;
}

export interface UserProfile {
  name: string;
  avatar: string;
}

@Injectable()
export class KnockProvider {
  
  private readonly api: string;
  private readonly socket: SocketIOClient.Socket;

  constructor(
    private http: HttpClient,
    private platform: Platform,
    private iab: InAppBrowser
  ) {
    this.api = `http://localhost:3777`;
    this.socket = io(this.api);

    this.socket.on('connection', () => {
      console.log('Init', this.api, this.socket.id);
    })
  }

  private onAuthSuccess$(socket: SocketIOClient.Socket): Observable<SignInSuccessResponse & SignInFailureResponse> {
    return Observable.create(observer => {
      const handler = (data) => {
        observer.next(data);
        observer.complete();
      };

      socket.on('auth:success', handler);
      return () => socket.off('auth:success', handler);
    })
  }

  public isAuthenticated() {
    return localStorage.getItem('token') != null;
  }

  public getUserProfile(): UserProfile {
    const profile = localStorage.getItem('userProfile');
    if (profile != null) {
      try {
        return JSON.parse(profile);
      } catch(err) {
        console.warn('Missing or invalid profile data');
        return null;
      }
    }
    return null;
  }

  public authorize() {
    return this.http
      .get<{ url: string }>(`${this.api}/auth-url`)
      .pipe(
        tap(res => {
          const state = JSON.stringify({ socketId: this.socket.id });
          const url = `${res.url}&state=${state}`;

          if (this.platform.is('ios') || this.platform.is('android')) {
            const iab = this.iab.create(url);
            iab.on('auth_end').subscribe(data => console.log('[[[auth_end]]]', data));
            iab.on('loadstop').subscribe(ev => console.log('[loadstop]', ev));
            iab.show();
            this.onAuthSuccess$(this.socket).subscribe(() => {
              console.log('[[[auth-success]]]')
            })
          } else {
            console.warn('No cordova platform')
          }
        }),
        switchMapTo(this.onAuthSuccess$(this.socket)),
        tap(authRes => {
          console.log('[authSuccess]', authRes);
          if (authRes.ok) {
            localStorage.setItem('token', authRes.access_token);
            localStorage.setItem('userId', authRes.user_id);
          }
        }),
        switchMap(authRes => {
          if (authRes.ok) {
            const url = `${ this.api }/user?token=${ authRes.access_token }&userId=${ authRes.user_id }`;

            return this.http.get<UserProfileResponse>(url)
          }

          return Observable.throw(new Error(authRes.error));
        }),
        tap(userProfile => {
          const profile = {
            avatar: userProfile.image_512,
            name: userProfile.real_name_normalized
          };

          localStorage.setItem('userProfile', JSON.stringify(profile));
        })
      );
  }

  public checkUser(socket) {
    const token = localStorage.getItem('token');

    return this.http
      .get<{ ok: boolean }>(`${ this.api }/test?token=${ token }`)
      .pipe(
        tap(res => console.log('[auth-state:check]', res)),
        catchError(err => {
          console.log('[auth-state:err]', err);
          return this.authorize();
        })
      );
  }

  public knock() {
    const profile = this.getUserProfile();
    const userId = localStorage.getItem('userId');
    const url = `${ this.api }/knock`;
    const data = {
      userName: profile.name,
      userId
    };

    return this.http.post<any>(url, data);
  }
}
