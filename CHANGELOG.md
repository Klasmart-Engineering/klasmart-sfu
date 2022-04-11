# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## 2.1.0 (2022-04-11)


### 📚 Docs

* **entry.ts, sfu.ts:** add logs for REDIS_MODE and USE_APOLLO ([72ce1e9](https://github.com/KL-Engineering/kidsloop-sfu/commits/72ce1e9a502b7dc3efd284fc76c2e5f4ba0ccad4))


### 🧪 Tests

* add track tests ([e85e464](https://github.com/KL-Engineering/kidsloop-sfu/commits/e85e464e04260a7d27faa9a0818e5eba552916b7))
* check if dist foder created ([774ad42](https://github.com/KL-Engineering/kidsloop-sfu/commits/774ad42d10392ba5ebdbf2551c273dd9aba6b311))
* **client tests:** fix client tests ([10bfd53](https://github.com/KL-Engineering/kidsloop-sfu/commits/10bfd5350707daecfca56ba570486136087b352b))
* **client, jest:** exclude tests from code coverage ([5849363](https://github.com/KL-Engineering/kidsloop-sfu/commits/5849363aee0e2ff518b043fa41e51ed0823ffc55))
* **client:** add client tests ([83aba28](https://github.com/KL-Engineering/kidsloop-sfu/commits/83aba285110aadc0e8e7cf6cfe984a28df2a8ed7))
* **client:** add client tests ([6557e6d](https://github.com/KL-Engineering/kidsloop-sfu/commits/6557e6d68f50fa70ec1e87b80c701547360ad386))
* **client:** add tests for client ([afbc2d6](https://github.com/KL-Engineering/kidsloop-sfu/commits/afbc2d625f6aa846b2ef4c9e2553d5ad612d9e78))
* **client:** more ergonomic tests ([18fa76c](https://github.com/KL-Engineering/kidsloop-sfu/commits/18fa76ce0e181427c0592d9605c3e493028ff29f))
* **consumer:** fix consumer tests, add missing emitted events ([7540355](https://github.com/KL-Engineering/kidsloop-sfu/commits/75403559d579ece5aa537db92b9efb42863db37b))
* **minor changes to consumer tests:** minor changes to consumer tests ([0b520b4](https://github.com/KL-Engineering/kidsloop-sfu/commits/0b520b4a2d2b07461ac098591d370abb683cf708))
* **producer:** remove producer tests ([1417841](https://github.com/KL-Engineering/kidsloop-sfu/commits/1417841a31efb77bc0b609d05e537058d8f59894))
* remove logs ([4ce19c1](https://github.com/KL-Engineering/kidsloop-sfu/commits/4ce19c1121a73e73d87d36a89b28c1d60425dea6))
* **room, track, httpserver:** update room and httpServer tests ([2d1b0f9](https://github.com/KL-Engineering/kidsloop-sfu/commits/2d1b0f9d91f845efcd7be4f80e920e74b4f26893))
* **sfu:** fix sfu tests ([6207a1c](https://github.com/KL-Engineering/kidsloop-sfu/commits/6207a1c8cfd82bdc909b2d1abfb6e6cb4ed5b2c8))
* **track:** fix track tests, fix some bugs associated wtih failing tests ([18dc6ee](https://github.com/KL-Engineering/kidsloop-sfu/commits/18dc6eeb65f3d9af78c6edee818d083e05381782))
* **v2, v2/tests:** make emitters private, expose functions explicitly, add room tests ([7b41d9c](https://github.com/KL-Engineering/kidsloop-sfu/commits/7b41d9c40c7ffdd9eec10d1f56c168ee72e1eee9))
* **v2/tests:** add consumer tests ([fff8d92](https://github.com/KL-Engineering/kidsloop-sfu/commits/fff8d928dd6c2b0d135ff04383b95a847bd86daa))
* **v2/tests:** add producer tests ([8213841](https://github.com/KL-Engineering/kidsloop-sfu/commits/8213841ca0bb0c37077be1e66439f988c7b9ea65))
* **v2/tests:** add producer tests ([7209df6](https://github.com/KL-Engineering/kidsloop-sfu/commits/7209df61ced9c40273abfcfc5b5755b47684b9dd))
* **v2/tests:** don't poll, wait for messages ([4a2bd13](https://github.com/KL-Engineering/kidsloop-sfu/commits/4a2bd1323438fb81d041cb82a746061bb2bc63cd))
* **v2/tests:** fix memory leak on track, add track tests, add type to consumer emitter ([2ee2f98](https://github.com/KL-Engineering/kidsloop-sfu/commits/2ee2f983715f8682afc0f02bbfd3d407a5a26b58))
* **v2:** close generator on ws close ([7e5867d](https://github.com/KL-Engineering/kidsloop-sfu/commits/7e5867d090af240b684eac08d849b1816e24c4e7))
* **v2:** create a nice handler for awaiting on websocket messages ([3978917](https://github.com/KL-Engineering/kidsloop-sfu/commits/3978917a4c504cee64450e0951aad90837365f17))
* **v2:** rebase on master ([a59f455](https://github.com/KL-Engineering/kidsloop-sfu/commits/a59f455d3559da91f2c54144bd0fb832e3ebf157))
* **v2:** update tests to run ([1e269b2](https://github.com/KL-Engineering/kidsloop-sfu/commits/1e269b2dbf2cb1415ca01bb0228cab15344d20a5))


### 📦 Refactor

* add RPC events and merge producer and track ([8a774d6](https://github.com/KL-Engineering/kidsloop-sfu/commits/8a774d6f7d2fe5a6bb9eddef90d40e1e28b07bb4))
* adjust protocol messages & types ([fba8760](https://github.com/KL-Engineering/kidsloop-sfu/commits/fba876045d2d243b4ad2c34f47d39dba0a99608d))
* **auth, wsserver:** better type auth errors for websocket connections ([8411200](https://github.com/KL-Engineering/kidsloop-sfu/commits/8411200077231f57cf395db0801df249a95c8511))
* **auth, wsserver:** further refine auth error types ([b66a51d](https://github.com/KL-Engineering/kidsloop-sfu/commits/b66a51d6558289f1fce9088ef86c77e41d2e4e2b))
* **entry, client, registrar, sfu:** put redis logic behind interface ([440d6fc](https://github.com/KL-Engineering/kidsloop-sfu/commits/440d6fc6fe44846970f3ad178aacee040caca6c8))
* make query params higher precedent than cookies ([d19ccb9](https://github.com/KL-Engineering/kidsloop-sfu/commits/d19ccb94c26fae4331570fe6ec7b06f926959f63))
* **new-relic:** Add custom metric reporting for sfu functions where context could be reported ([f12a366](https://github.com/KL-Engineering/kidsloop-sfu/commits/f12a3668256e030d500efec6f5e7866a727dc930)), closes [KLL-1796](https://calmisland.atlassian.net/browse/KLL-1796)
* **new-relic:** Remove transactions used in function logic that would now be handled by withTransaction ([4526959](https://github.com/KL-Engineering/kidsloop-sfu/commits/45269599525181bbb96fb7b0031b3a2e05f33bce)), closes [KLL-1796](https://calmisland.atlassian.net/browse/KLL-1796)
* remove websocket spam ([d3b89f4](https://github.com/KL-Engineering/kidsloop-sfu/commits/d3b89f4632dd1f272967ef9ebdf5435cb8844be7))
* **wip everything:** break everything ([9e6b22a](https://github.com/KL-Engineering/kidsloop-sfu/commits/9e6b22a8ad955e6b34c1ff9d55818d0e84708dc8))
* **wip tidy:** small changes for consistency ([eaf6fc0](https://github.com/KL-Engineering/kidsloop-sfu/commits/eaf6fc03d9184eaf0435245fe9cdea1ef33dda88))
* **wsserver:** send authError directly instead of renaming name field ([b260936](https://github.com/KL-Engineering/kidsloop-sfu/commits/b26093652d511af1bb369d27e4145cc6cf0e2769))


### ✨ Features

* add alpha pipeline ([a237bdf](https://github.com/KL-Engineering/kidsloop-sfu/commits/a237bdf84b496777cbfb73087822655494ace4cd))
* additional logging for close events ([320c641](https://github.com/KL-Engineering/kidsloop-sfu/commits/320c6418d84843b503752def590225c4dcb768da))
* additional logs ([3702929](https://github.com/KL-Engineering/kidsloop-sfu/commits/37029296aa7236c7421cf3aebf6827046a48ec8c))
* also use query parameters for authentication in development environment ([c55df79](https://github.com/KL-Engineering/kidsloop-sfu/commits/c55df79261639e1dd067928e9ee0be278201673f))
* **auth, wsserver:** distinguish between authentication & authorization errors ([af40c2e](https://github.com/KL-Engineering/kidsloop-sfu/commits/af40c2e222dcb2c27e930b9576bd62f475b05ce5))
* change target & enable nessary options ([42e31e1](https://github.com/KL-Engineering/kidsloop-sfu/commits/42e31e19f707f04f7b8c39d9999aeca361f8db4a))
* **client.ts, rediskeys.ts:** update redis when a track is created, remove it when closed ([f787dea](https://github.com/KL-Engineering/kidsloop-sfu/commits/f787dea1180d867e84d21841efc8be322c6b4703))
* **client.ts:** add keepAlive message ([ac901a6](https://github.com/KL-Engineering/kidsloop-sfu/commits/ac901a6c3731ffc5b3f40ffa234976c3b9c8f310))
* **client:** limit max number of producers a client can create ([d3a5178](https://github.com/KL-Engineering/kidsloop-sfu/commits/d3a5178881458fde6ac68e52a0bdd2300ae8d6cd))
* configure for production ([022c7de](https://github.com/KL-Engineering/kidsloop-sfu/commits/022c7de64e57f508309cd3162ff85055d4b1ec56))
* **entry:** support redis in cluster mode ([2df3998](https://github.com/KL-Engineering/kidsloop-sfu/commits/2df3998914f48aa8711d3de030ab2f7a6f6807bf))
* ignore more files ([2a2d68a](https://github.com/KL-Engineering/kidsloop-sfu/commits/2a2d68a1909ed266021e04a9b223fdf87ddb2c70))
* install ts-node-dev & configure build ([4571bee](https://github.com/KL-Engineering/kidsloop-sfu/commits/4571bee70abe66ca95be6fb203be195fcb92bef1))
* log uncaughtExceptions ([cc64c99](https://github.com/KL-Engineering/kidsloop-sfu/commits/cc64c9948aec7ac02ef60a5f4d491b6283516bb5))
* **new-relic-custom-instrumentation:** add custom intrumentation wrappers ([46f1cb6](https://github.com/KL-Engineering/kidsloop-sfu/commits/46f1cb65647441e6a90f96a1c4cfd996f61da8a3))
* **new-relic-custom-instrumentation:** add preshutdown newrelic metric push calls ([4ee6bd3](https://github.com/KL-Engineering/kidsloop-sfu/commits/4ee6bd3a3e539bf05b8251f2e5de01fa19aca23d))
* **new-relic:** Add deeper new relic integration ([1a44194](https://github.com/KL-Engineering/kidsloop-sfu/commits/1a4419412d0c8ffe224b561a65ffc76526b25f71)), closes [KLL-1796](https://calmisland.atlassian.net/browse/KLL-1796)
* **new-relic:** Add experimental NewRelicApolloTransactionWrapPlugin ([6cea70b](https://github.com/KL-Engineering/kidsloop-sfu/commits/6cea70b78709ca86332229cdb430437efe25eabe)), closes [KLL-1796](https://calmisland.atlassian.net/browse/KLL-1796)
* **new-relic:** Adds ts-ignore to newrelic packages that have no typing information available. Fixes reference to winston-enricher.  Adds new relic log file to .gitignore ([b7c5585](https://github.com/KL-Engineering/kidsloop-sfu/commits/b7c5585fe6b9a94259be895134689ae3e77ba1ae)), closes [KLL-1685](https://calmisland.atlassian.net/browse/KLL-1685)
* **new-relic:** replace custom new relic wrapping plugin with withTransaction resolver wrapping function ([82f0707](https://github.com/KL-Engineering/kidsloop-sfu/commits/82f070732f19f07f7e9c1b0c4f4fbdd4c045c63e)), closes [KLL-1796](https://calmisland.atlassian.net/browse/KLL-1796)
* **rediskeys, registrar:** add to track stream on track registration ([dab66fc](https://github.com/KL-Engineering/kidsloop-sfu/commits/dab66fcb6a498bb9136d6f9c41420b8cc69ac970))
* **registrar:** add expire refresh to all track operations ([bdd4303](https://github.com/KL-Engineering/kidsloop-sfu/commits/bdd4303838a17f93a6278b2c78bcd5fa65cff2a1))
* **registrar:** add timeout on tracks set ([e75bcbc](https://github.com/KL-Engineering/kidsloop-sfu/commits/e75bcbc82f69cf02ad4f1b32b524061bbcbb75c0))
* run bundled file ([5d923b0](https://github.com/KL-Engineering/kidsloop-sfu/commits/5d923b09fda6e54158dda9e5b68fc5bad1ee045c))
* run from build file ([ac313ec](https://github.com/KL-Engineering/kidsloop-sfu/commits/ac313ecae638a837bb2536a5adac81c1364124a6))
* **sfu.ts:** support redis in cluster mode ([54fa9c3](https://github.com/KL-Engineering/kidsloop-sfu/commits/54fa9c35e79542a588a17ac9272d5634403c6f01)), closes [KLL-1905](https://calmisland.atlassian.net/browse/KLL-1905)
* split rooms over different workers to isolate worker crashes ([855ba1d](https://github.com/KL-Engineering/kidsloop-sfu/commits/855ba1d574e68249ddb115993540ed36bfad04b1))
* **v2/sfu.ts, entry.ts:** register sfu to redis on startup ([40d11bc](https://github.com/KL-Engineering/kidsloop-sfu/commits/40d11bc01e6b895e4d50938c9093a6d4e94517ac)), closes [KLL-2316](https://calmisland.atlassian.net/browse/KLL-2316)
* **v2/sfu:** add set that tracks online sfus to redis ([b84ece9](https://github.com/KL-Engineering/kidsloop-sfu/commits/b84ece9555d0c36657b0343fa41f29798e63fa35))
* **v2:** store specific information in redis ([525101f](https://github.com/KL-Engineering/kidsloop-sfu/commits/525101f6cb8c56e1f81660bc3f39d092bd1b0c7d))
* **v2:** use WebRtcTrack for registrar input ([b60d0ad](https://github.com/KL-Engineering/kidsloop-sfu/commits/b60d0ad6b8c2e12afd63bd80f795345e63cf45dc))
* **wsserver:** name error codes to prevent misuse ([b388ee0](https://github.com/KL-Engineering/kidsloop-sfu/commits/b388ee0df612b2ac2a6190f0332da478fedcbb4e))
* **wsserver:** send error code with error message ([591f245](https://github.com/KL-Engineering/kidsloop-sfu/commits/591f2457ff0819baf4a9b8c2dd477576f618f720))
* **wsserver:** send error message on auth failure ([9ac92ba](https://github.com/KL-Engineering/kidsloop-sfu/commits/9ac92ba5490a28677d69ddedf92c50d8cc523219)), closes [KLL-2975](https://calmisland.atlassian.net/browse/KLL-2975)


### 🐛 Bug Fixes

* add custom typedefs to newrelic plugins ([06c6849](https://github.com/KL-Engineering/kidsloop-sfu/commits/06c6849c1d54555afac7c36e3e8af3e98ef08952))
* **auth, wsserver:** fix serialization of Auth Errors ([25ba164](https://github.com/KL-Engineering/kidsloop-sfu/commits/25ba16452ae287a3c613dd00bf3e04f9af108f8b))
* **auth.ts, entry.ts:** ensure that debug issuers get set before they are used ([166f6d1](https://github.com/KL-Engineering/kidsloop-sfu/commits/166f6d1f958fc3de51a15e7e291081c812de4ec2))
* **auth:** fix error code generation for non token-validation errors ([2932903](https://github.com/KL-Engineering/kidsloop-sfu/commits/2932903a263b66a19fc8d687526e30d58c998aef))
* **client:** use both localPause and globalPause for webrtctrack ([3cd9fc4](https://github.com/KL-Engineering/kidsloop-sfu/commits/3cd9fc44a7d36e7af55fbc5cedc441522b887ddc))
* **client:** use globalPause value for update track in registrar ([b4ef02e](https://github.com/KL-Engineering/kidsloop-sfu/commits/b4ef02e6169345d057c701bc1cc865729ef1a6eb))
* consumerTransport not closing when producerTransport has not been initialized ([f1c2d82](https://github.com/KL-Engineering/kidsloop-sfu/commits/f1c2d82960637296fa9b8cd92c21b13ad7bda205))
* don't rethrow authentication errors ([d0bc582](https://github.com/KL-Engineering/kidsloop-sfu/commits/d0bc582b601675af14db9264c4eb639e98d344c9))
* get authorization token from url query parameters ([9ad2405](https://github.com/KL-Engineering/kidsloop-sfu/commits/9ad2405df5624643787420f2f5b9de19c0a5e69d))
* handle authentication before ws upgrade ([f103988](https://github.com/KL-Engineering/kidsloop-sfu/commits/f1039880398f7cea871dc153002e94555fcb9cd6))
* include mute state in producerCreated message to synchronize message order ([3ef2981](https://github.com/KL-Engineering/kidsloop-sfu/commits/3ef29813739d96054e18c11fc8ba6f2681aadd4d))
* listener proxies ([84f9db5](https://github.com/KL-Engineering/kidsloop-sfu/commits/84f9db5d1a2c8efc0e3e9c94affb845ddcb4afa6))
* **logger:** revert enricher from winston logger to troubleshoot issue with logs written as object ([195797d](https://github.com/KL-Engineering/kidsloop-sfu/commits/195797debbae55d56431dd3be8a279a0fdfa346f))
* **new-relic-custom-instrumentation:** fix missing return statement prefixing wrapper transaction ([8bb230c](https://github.com/KL-Engineering/kidsloop-sfu/commits/8bb230c5d8881b79ae5748f5005b1f03b1ea8135))
* **new-relic-custom-instrumentation:** remove custom transaction from claimRoom ([fd9ab51](https://github.com/KL-Engineering/kidsloop-sfu/commits/fd9ab5113d4210befdf761f7138dd1ddc1cde287))
* **new-relic-custom-instrumentation:** swap startWebTransaction with startBackgroundTransaction ([1ab73a1](https://github.com/KL-Engineering/kidsloop-sfu/commits/1ab73a1cbb32f9d2d0aa1497e9754522b4120d22))
* **new-relic:** move @types/newrelic to dev dependencies ([50e1847](https://github.com/KL-Engineering/kidsloop-sfu/commits/50e1847e34462ce11b39077fd64e0e2ba6fabee8)), closes [KLL-1685](https://calmisland.atlassian.net/browse/KLL-1685)
* **new-relic:** Move NR metrics reporting code above CF metrics code ([4a37368](https://github.com/KL-Engineering/kidsloop-sfu/commits/4a37368265b9669c48472350bd5d14b19dae7a05)), closes [KLL-1796](https://calmisland.atlassian.net/browse/KLL-1796)
* **new-relic:** removed unused import ([5facc09](https://github.com/KL-Engineering/kidsloop-sfu/commits/5facc0929af271b5e3b4d22505900875410414a2))
* **packages.json:** fix version ([2a4315d](https://github.com/KL-Engineering/kidsloop-sfu/commits/2a4315dab94f238b6df0a54d97d5415fcdabe14f))
* per room sequentially process network messages ([00813c4](https://github.com/KL-Engineering/kidsloop-sfu/commits/00813c4802ef67be171bbf8cae96f0973537ed40))
* pipeline reference image tag ([ca74b13](https://github.com/KL-Engineering/kidsloop-sfu/commits/ca74b133544d448c608f9bfb7d7a6c7b7f2ca036))
* **rediskeys.ts:** update keys to always hash to the same node ([14444a3](https://github.com/KL-Engineering/kidsloop-sfu/commits/14444a3e7b1446d9334c27283e7edc8c0ae357de))
* remove 'include' from tsconfig ([de0d5a7](https://github.com/KL-Engineering/kidsloop-sfu/commits/de0d5a7d27b3e3db1b20fb58584db7e9295ea56b))
* remove consumers from track on close ([09d1ddb](https://github.com/KL-Engineering/kidsloop-sfu/commits/09d1ddbea7179dafd79d3f117a56f1dca031b80e))
* removed accidentally added unused import ([5a1d3ec](https://github.com/KL-Engineering/kidsloop-sfu/commits/5a1d3ec9090acd732ba091879acfc66fecd090db))
* revert changes ([bd49af1](https://github.com/KL-Engineering/kidsloop-sfu/commits/bd49af17359c89babbfa508df762ada426efc94a))
* **tests:** fix tests to not be old versions ([2da10e5](https://github.com/KL-Engineering/kidsloop-sfu/commits/2da10e5ef3c006e47329a706ee67a5260cf3725a))
* **track:** add missing awaits on async statements ([464987e](https://github.com/KL-Engineering/kidsloop-sfu/commits/464987e95d1ae01f24ba8f7e2e6e0b0835d3995a))
* update message ([46e503b](https://github.com/KL-Engineering/kidsloop-sfu/commits/46e503b65da31042542c9c96904484bc8f8348a9))
* use npm ci ([575c06f](https://github.com/KL-Engineering/kidsloop-sfu/commits/575c06f5f68d2411f1962274f2907de576b88b0c))
* **winston-enricher:** fix integration of winston enricher to logger, uses enricher when NEW_RELIC_LICENSE_KEY is provided ([9acedcf](https://github.com/KL-Engineering/kidsloop-sfu/commits/9acedcf602b9790924edcf69dce2249c32e138ae))


### 💎 Style

* **all:** use Logger not console ([d39c4ba](https://github.com/KL-Engineering/kidsloop-sfu/commits/d39c4ba534f11ee5a26c669cdc9c1114ea8214dd))
* **all:** whitespace, typos ([2df8275](https://github.com/KL-Engineering/kidsloop-sfu/commits/2df827559230e21d61ed67881b03b2e8410a18b6))
* **auth:** explicit visibility modifier ([e23cc46](https://github.com/KL-Engineering/kidsloop-sfu/commits/e23cc46c96c78fab362d6316cb56a3c4dc13d191))
* **client:** fix typo, remove duplicate SfuId ([2d4924c](https://github.com/KL-Engineering/kidsloop-sfu/commits/2d4924c518cfee9fc3b157c5a7e7ec774ea8094f))
* **sfu.ts, client.ts:** whitespace ([2019677](https://github.com/KL-Engineering/kidsloop-sfu/commits/2019677458835bdc5b98790444d21bd65dd76d8e))
* **track, client, tsconfig:** make names less insane ([4d7f150](https://github.com/KL-Engineering/kidsloop-sfu/commits/4d7f150a6e6ff9a9b91ca1404838a0644c5630f5))
* **v2:** use more functional style for counting load ([596ca2e](https://github.com/KL-Engineering/kidsloop-sfu/commits/596ca2ed3c329581f0328dae3b941e6de7c6ac92))


### ♻️ Chores

* **.gitignore:** ignore IDEA based IDE settings ([15736e5](https://github.com/KL-Engineering/kidsloop-sfu/commits/15736e5e27d72842e868cb5155772f9dd96e1b71))
* add readme & env example [ci skip] ([99772f1](https://github.com/KL-Engineering/kidsloop-sfu/commits/99772f1173b4a7e0aa8a015d3f26498198e1f019))
* **deploy:** remove old deploy scripts ([6ec220b](https://github.com/KL-Engineering/kidsloop-sfu/commits/6ec220bd8bd2eff19f4dfa0ba8586d63c0dfe7a6))
* disable ws disconnect timeout ([77f90fa](https://github.com/KL-Engineering/kidsloop-sfu/commits/77f90fa1b005c5d5acdd0430a8617839ccb3791e))
* docker file update ([fbefc94](https://github.com/KL-Engineering/kidsloop-sfu/commits/fbefc943e2df98d4fa95b198847b06720f7552cb))
* enhance docker and loadtest confgi ([df71657](https://github.com/KL-Engineering/kidsloop-sfu/commits/df71657583a0bef6b6d9651d66b43fa743569b4d))
* fix installation of node 16 inside docker ([9bb2214](https://github.com/KL-Engineering/kidsloop-sfu/commits/9bb2214f024f50ea68eb10fc9481def0212ab90d))
* fix sfu reference ([1c978f7](https://github.com/KL-Engineering/kidsloop-sfu/commits/1c978f776cf2ee8ce6df1f2a8561ef21247689ab))
* load test stuff ([06f8ce4](https://github.com/KL-Engineering/kidsloop-sfu/commits/06f8ce4181b5cf80640de609b8c5b0f346a8f684))
* **package.json, package-lock.json:** update packages ([90ccd06](https://github.com/KL-Engineering/kidsloop-sfu/commits/90ccd06d59a158b8a9de9c2b81e7955df4d0fa59))
* remove sudo ([bde4df7](https://github.com/KL-Engineering/kidsloop-sfu/commits/bde4df7eb779febea6e3a27a53237edf142781b8))
* run correct docker build file ([05f28c6](https://github.com/KL-Engineering/kidsloop-sfu/commits/05f28c63105c8bf910fd6f6b8cd447ff3929697c))
* update mediasoup ([5fcf931](https://github.com/KL-Engineering/kidsloop-sfu/commits/5fcf9314a275668760cbd3955f2fcf825395c145))


### 🔨 Build

* **bump-version:** add bump version workflow ([3c4d38e](https://github.com/KL-Engineering/kidsloop-sfu/commits/3c4d38e4c518adc7eb0c39d9b4f5ba1e38a95fbf))
* **deps:** bump minimist from 1.2.5 to 1.2.6 ([9effae2](https://github.com/KL-Engineering/kidsloop-sfu/commits/9effae2740bd8e11e3640067b47e392e23592847))
* **deps:** Bump newrelic agent from 8.4.0 to 8.5.1 ([5560f07](https://github.com/KL-Engineering/kidsloop-sfu/commits/5560f07b97ade4d6c0ae61086ecd305eb23b7045))
* **dockerfile:** add python step for meson building for mediasoup ([700cf39](https://github.com/KL-Engineering/kidsloop-sfu/commits/700cf39d3c00074174f8a91378fe745d649b5867))
* **dockerfile:** update node in docker to version 16 ([691863c](https://github.com/KL-Engineering/kidsloop-sfu/commits/691863cd02132dd12ebe432cd64d0237106dd0b1))
* **dotfiles:** add npmrc, npmignore, versionrc ([4e63bbd](https://github.com/KL-Engineering/kidsloop-sfu/commits/4e63bbd8db8ae5ca69b33fa881e376f3e3bf160d))
* **package, auth:** use gh package for auth ([097ba40](https://github.com/KL-Engineering/kidsloop-sfu/commits/097ba400c71303bebc4d2bb6ab25d90e00986027))
* **package, workflows:** update version, add workflow for building & pushing to ECR ([b2f9f3a](https://github.com/KL-Engineering/kidsloop-sfu/commits/b2f9f3afa2d2597993193f7624f592fd7115970d))
* **package.json:** update typescript to 4.5.5 ([0521666](https://github.com/KL-Engineering/kidsloop-sfu/commits/0521666bed349c5278a416c004a94402fe281ed5))
* **package:** update mediasoup ([37749af](https://github.com/KL-Engineering/kidsloop-sfu/commits/37749afa6317ea69d9a0de4f449387e780e6170d))
* **sfu.ts, client.ts, package.json, package-lock.json:** update MediaSoup to version 3.9 ([741c429](https://github.com/KL-Engineering/kidsloop-sfu/commits/741c429d86b407e672333e97ebfd1a79d5d80f0b))
* use v2 entrypoint ([4728dc4](https://github.com/KL-Engineering/kidsloop-sfu/commits/4728dc4bedb0e9211ad1a536093e414e52278217))


### ⚙️ Continuous Integrations

* **dockerfile, bitbucket-pipelines.yml:** move pip into build step ([f5a1057](https://github.com/KL-Engineering/kidsloop-sfu/commits/f5a1057cd823021550fba8239682a8ee192a1eaa))
* **package:** add standard-version release script ([a472b34](https://github.com/KL-Engineering/kidsloop-sfu/commits/a472b34194e889afc10cd764404861535281cae9))
