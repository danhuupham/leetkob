#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> a;
    int x;
    while (cin >> x) a.push_back(x);
    cout << a.size() << endl;
    for (int i = (int)a.size() - 1; i >= 0; i--) cout << a[i] << ' ';
    cout << endl;
    return 0;
}
