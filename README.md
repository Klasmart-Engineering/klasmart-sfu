**Description:**

---

## How to set up locally


1. Clone repository, Recommended using **ssh+clone** to skip authentication every time
2. Run ***npm i***  to install required packages
3. create ***.env*** same as ***.env.example*** file
4. Finally, run ***npm start***.


## How to make PR
`main` branch contains production ready code.  
If there are any feature/bug_fixes need to be added. Start new branch onto `main`.  
When feature/bug_fixes are ready to merge, make ***PR*** (Pull Request) targeting `main`.  
All commits [must be signed](https://git-scm.com/book/en/v2/Git-Tools-Signing-Your-Work).

## How to make commit
We follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0-beta.2/)

Common usage **[type]: description**  
Most used commit types:  
1. **fix** - patches a bug in your codebase (this correlates with PATCH in semantic versioning)  
2. **feat** - introduces a new feature to the codebase (this correlates with MINOR in semantic versioning)  
3. Also, **chore, test, style, refactor**

## How to control versioning 

We follow [Semantic Versioning](https://semver.org/)

1. ***major*** version when you make incompatible API changes  
2. ***minor*** version when you add functionality in a backwards compatible manner  
3. ***patch*** version when you make backwards compatible bug fixes  

**npm version <update_types>** will upgrade version and make commit.
