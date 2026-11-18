#include <iostream>
#include <string>
#include <algorithm>
using namespace std;

int main() {
    string s;
    getline(cin, s);
    int n = s.size();
    int start = 0;
    for (int i = 0; i <= n; i++) {
        if (i == n || s[i] == ' ') {
            int l = start, r = i - 1;
            while (l < r) {
                swap(s[l], s[r]);
                l++;
                r--;
            }
            start = i + 1;
        }
    }
    cout << s << endl;
    return 0;
}
