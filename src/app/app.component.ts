import { Component, EventEmitter } from '@angular/core';
import { DomSanitizer, SafeStyle } from '@angular/platform-browser';

import { Platform, LoadingController, ToastController } from 'ionic-angular';
import { SplashScreen } from '@ionic-native/splash-screen';
import { StatusBar } from '@ionic-native/status-bar';
import { tap, delay, switchMap, debounceTime, first, skip, filter } from 'rxjs/operators';
import { concat } from 'rxjs';

import { KnockProvider, UserProfile } from './knock.provider';
import { Gradients } from './gradients';

@Component({
  templateUrl: 'app.html'
})
export class MyApp {
  private readonly knock$: EventEmitter<void>;
  public isAuthenticated: boolean;
  public profile: UserProfile;

  public gradient: SafeStyle;

  constructor(
    private platform: Platform,
    private splashScreen: SplashScreen,
    private statusBar: StatusBar,
    private knockProvider: KnockProvider,
    private sanitizer: DomSanitizer,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {
    this.initializeApp();
    this.knock$ = new EventEmitter();
    this.gradient = this.getRandomGradientStyle();
    this.isAuthenticated = this.knockProvider.isAuthenticated();

    if (this.isAuthenticated) {
      this.profile = this.knockProvider.getUserProfile();
    }

    concat(
      this.knock$.pipe(first()),
      this.knock$.pipe(skip(1), debounceTime(2000))
    )
      .pipe(
        filter(() => this.isAuthenticated),
        switchMap(() => {
          const loading = this.loadingCtrl.create({
            cssClass: 'knock-loading',
            showBackdrop: false
          });

          loading.present();

          console.log('[requesting-knock]');

          return this.knockProvider
            .knock()
            .pipe(
              tap((data) => console.log('[knock-requested]', data)),
              delay(500),
              tap(() => {
                loading
                  .dismiss()
                  .then(() => this.toastCtrl
                    .create({
                      message: 'Sent',
                      position: 'top',
                      duration: 3e3,
                      cssClass: 'knock-toast'
                    })
                    .present()
                  );
              })
            )
        })
      )
      .subscribe();
  }

  private initializeApp() {
    this.platform.ready().then(() => {
      if (this.platform.is('cordova')) {
        this.statusBar.styleDefault();
        this.splashScreen.hide();
      }
    });
  }

  public signIn() {
    this.knockProvider
      .authorize()
      .pipe(
        tap(() => {
          this.isAuthenticated = this.knockProvider.isAuthenticated();
          if (this.isAuthenticated) {
            this.profile = this.knockProvider.getUserProfile();
          }
        })
      )
      .subscribe();
  }

  public async knock() {
    if (this.isAuthenticated) {
      this.knock$.emit();
    }
    this.gradient = this.getRandomGradientStyle();
  }

  public getAvatarUrl() {
    const style = `--avatar-url: url("${ this.profile.avatar }")`;
    return this.sanitizer.bypassSecurityTrustStyle(style);
  }

  public getRandomGradientStyle() {
    const min = Math.ceil(0);
    const max = Math.floor(Gradients.length);
    const index = Math.floor(Math.random() * (max - min)) + min;
    const gradient = Gradients[index];
    const style = `background-image: linear-gradient(45deg, ${ gradient.join(', ') })`;
    return this.sanitizer.bypassSecurityTrustStyle(style);
  }
}

