#include <iostream>
#include <stack>
#include <string>
using namespace std;

int main() {
    string s;
    getline(cin, s);
    stack<char> st;
    string res = "";
    for (int i = 0; i <= (int)s.size(); i++) {
        if (i == (int)s.size() || s[i] == ' ') {
            while (!st.empty()) {
                res += st.top();
                st.pop();
            }
            if (i < (int)s.size()) res += ' ';
        } else {
            st.push(s[i]);
        }
    }
    cout << res << endl;
    return 0;
}
